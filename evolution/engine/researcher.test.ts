import { describe, expect, it } from "vitest";
import { Researcher } from "./researcher";
import { MockProvider } from "../../providers/mock-provider";
import { promptRewriteMutation } from "../mutation/mutations/prompt-rewrite";
import { temperatureMutation } from "../mutation/mutations/temperature";
import type { AIProvider, ChatMessage, ChatOptions, ChatResult } from "../../providers/types";
import type { SystemSnapshot } from "./types";

class ScriptedProvider extends MockProvider implements AIProvider {
  constructor(private response: string) {
    super();
  }
  async chat(_messages: ChatMessage[], _options?: ChatOptions): Promise<ChatResult> {
    return { content: this.response };
  }
}

class ThrowingProvider extends MockProvider implements AIProvider {
  async chat(): Promise<ChatResult> {
    throw new Error("LM Studio is not running");
  }
}

const snapshot: SystemSnapshot = {
  timestamp: new Date().toISOString(),
  activeProvider: "lmstudio",
  registeredMutations: ["prompt-rewrite", "temperature-adjust"],
  registeredBenchmarks: ["code-gen-is-palindrome"],
  recentBenchmarkScores: { "code-gen-is-palindrome": 0.6 },
  recentActivity: ["agent:started {}"]
};

const mutations = [promptRewriteMutation, temperatureMutation];

describe("Researcher", () => {
  it("parses a well-formed JSON hypothesis and validates the chosen mutation id", async () => {
    const response = JSON.stringify({
      summary: "Lower the temperature to reduce variance",
      filesToModify: ["agents/generic-agent.ts"],
      implementationPlan: "Add temperature: 0.2 to the chat() call",
      expectedImpact: "More consistent benchmark scores",
      risks: "Slightly less creative output",
      benchmarkStrategy: "Run reasoning benchmark 3x and compare variance",
      mutationId: "temperature-adjust",
      mutationParams: { temperature: 0.2 }
    });
    const researcher = new Researcher(new ScriptedProvider(response));

    const hypothesis = await researcher.propose(snapshot, mutations);
    expect(hypothesis.mutationId).toBe("temperature-adjust");
    expect(hypothesis.mutationParams).toEqual({ temperature: 0.2 });
    expect(hypothesis.summary).toContain("temperature");
  });

  it("falls back to the first mutation when the response names an unregistered mutation id", async () => {
    const response = JSON.stringify({
      summary: "test",
      filesToModify: [],
      implementationPlan: "",
      expectedImpact: "",
      risks: "",
      benchmarkStrategy: "",
      mutationId: "does-not-exist"
    });
    const researcher = new Researcher(new ScriptedProvider(response));

    const hypothesis = await researcher.propose(snapshot, mutations);
    expect(hypothesis.mutationId).toBe("prompt-rewrite");
  });

  it("falls back to a safe hypothesis when the response is not parseable JSON", async () => {
    const researcher = new Researcher(new ScriptedProvider("I refuse to answer in JSON."));
    const hypothesis = await researcher.propose(snapshot, mutations);

    expect(hypothesis.mutationId).toBe("prompt-rewrite");
    expect(hypothesis.summary).toContain("Fallback hypothesis");
  });

  it("falls back to a safe hypothesis when the research provider throws (e.g. LM Studio not running)", async () => {
    const researcher = new Researcher(new ThrowingProvider());
    const hypothesis = await researcher.propose(snapshot, mutations);

    expect(hypothesis.mutationId).toBe("prompt-rewrite");
    expect(hypothesis.summary).toMatch(/LM Studio is not running/);
  });

  it("throws synchronously if no mutations are registered at all", async () => {
    const researcher = new Researcher(new ScriptedProvider("{}"));
    await expect(researcher.propose(snapshot, [])).rejects.toThrow(/no mutations are registered/);
  });
});
