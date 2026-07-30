import { describe, expect, it } from "vitest";
import { BenchmarkRunner } from "./benchmark-runner";
import { BenchmarkRegistry } from "./registry";
import { codeGenerationBenchmark } from "./benchmarks/code-generation";
import { reasoningPlanningBenchmark } from "./benchmarks/reasoning";
import { ToolRegistry } from "../../tools/registry";
import { MockProvider } from "../../providers/mock-provider";
import type { AIProvider, ChatMessage, ChatOptions, ChatResult, StreamChunk } from "../../providers/types";

class ScriptedProvider extends MockProvider implements AIProvider {
  constructor(private response: string, private delayMs = 0) {
    super();
  }
  async chat(_messages: ChatMessage[], _options?: ChatOptions): Promise<ChatResult> {
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    return { content: this.response };
  }
}

function contextWith(provider: AIProvider) {
  return { provider, tools: new ToolRegistry(), cwd: process.cwd() };
}

describe("BenchmarkRegistry", () => {
  it("registers and filters benchmarks by category", () => {
    const registry = new BenchmarkRegistry();
    registry.register(codeGenerationBenchmark);
    registry.register(reasoningPlanningBenchmark);

    expect(registry.list()).toHaveLength(2);
    expect(registry.byCategory("code-generation")).toEqual([codeGenerationBenchmark]);
    expect(registry.get("reasoning-ci-setup-plan")).toBe(reasoningPlanningBenchmark);
  });
});

describe("BenchmarkRunner", () => {
  it("scores a strong code-generation response highly", async () => {
    const goodAnswer = `function isPalindrome(s: string): boolean {
      const cleaned = s.toLowerCase().replace(/[^a-z0-9]/g, "");
      return cleaned === cleaned.split("").reverse().join("");
    }`;
    const runner = new BenchmarkRunner();
    const result = await runner.run(codeGenerationBenchmark, contextWith(new ScriptedProvider(goodAnswer)));

    expect(result.score).toBe(1);
    expect(result.passed).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("scores an irrelevant response low", async () => {
    const runner = new BenchmarkRunner();
    const result = await runner.run(codeGenerationBenchmark, contextWith(new ScriptedProvider("I like turtles.")));

    expect(result.score).toBeLessThan(0.6);
    expect(result.passed).toBe(false);
  });

  it("scores reasoning responses by concept coverage", async () => {
    const runner = new BenchmarkRunner();
    const strong = await runner.run(
      reasoningPlanningBenchmark,
      contextWith(
        new ScriptedProvider(
          "First run lint and typecheck in parallel, then build, then run tests, then commit and push through the pipeline."
        )
      )
    );
    const weak = await runner.run(reasoningPlanningBenchmark, contextWith(new ScriptedProvider("Just do it.")));

    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it("records a timeout as a failed, zero-score result instead of throwing", async () => {
    const runner = new BenchmarkRunner();
    const slowBenchmark = { ...codeGenerationBenchmark, timeoutMs: 10 };
    const result = await runner.run(slowBenchmark, contextWith(new ScriptedProvider("irrelevant", 100)));

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.error).toMatch(/timed out/);
  });

  it("runs a full set of benchmarks concurrently via runAll", async () => {
    const runner = new BenchmarkRunner();
    const results = await runner.runAll(
      [codeGenerationBenchmark, reasoningPlanningBenchmark],
      contextWith(new ScriptedProvider("function isPalindrome(s: string): boolean { return true; }"))
    );
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.benchmarkId).sort()).toEqual(["code-gen-is-palindrome", "reasoning-ci-setup-plan"]);
  });
});
