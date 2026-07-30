import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Observer } from "./observer";
import { EventBus } from "../../kernel/event-bus";
import { ProviderRegistry } from "../../providers/registry";
import { MutationRegistry } from "../mutation/registry";
import { BenchmarkRegistry } from "../benchmark/registry";
import { ExperimentStore } from "../history/experiment-store";
import { promptRewriteMutation } from "../mutation/mutations/prompt-rewrite";
import { codeGenerationBenchmark } from "../benchmark/benchmarks/code-generation";
import { defaultConfig } from "../../kernel/config";
import type { ExperimentRecord } from "../history/types";

describe("Observer", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-observer-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("summarizes provider, mutations, benchmarks, activity and score history", () => {
    const eventBus = new EventBus();
    eventBus.emit("agent:started", { agent: "generic" });
    eventBus.emit("log", { ignored: true });

    const mutations = new MutationRegistry();
    mutations.register(promptRewriteMutation);

    const benchmarks = new BenchmarkRegistry();
    benchmarks.register(codeGenerationBenchmark);

    const history = new ExperimentStore(root);
    const record: ExperimentRecord = {
      id: "exp-1",
      createdAt: new Date().toISOString(),
      status: "completed",
      hypothesis: {
        summary: "",
        filesToModify: [],
        implementationPlan: "",
        expectedImpact: "",
        risks: "",
        benchmarkStrategy: "",
        mutationId: "prompt-rewrite"
      },
      mutationId: "prompt-rewrite",
      researchProvider: "mock",
      researchModel: "mock",
      gitBranch: "evolution/exp-1",
      result: "accepted",
      logs: [],
      benchmarkResults: [
        { benchmarkId: "code-gen-is-palindrome", category: "code-generation", score: 0.75, passed: true, latencyMs: 10, output: "..." }
      ]
    };
    history.save(record);

    const observer = new Observer({
      eventBus,
      providers: new ProviderRegistry(defaultConfig()),
      mutations,
      benchmarks,
      history
    });

    const snapshot = observer.snapshot();
    expect(snapshot.activeProvider).toBe("mock");
    expect(snapshot.registeredMutations).toEqual(["prompt-rewrite"]);
    expect(snapshot.registeredBenchmarks).toEqual(["code-gen-is-palindrome"]);
    expect(snapshot.recentBenchmarkScores["code-gen-is-palindrome"]).toBe(0.75);
    expect(snapshot.recentActivity.some((line) => line.includes("agent:started"))).toBe(true);
    expect(snapshot.recentActivity.some((line) => line.startsWith("log "))).toBe(false);
  });
});
