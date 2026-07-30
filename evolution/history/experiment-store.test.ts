import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ExperimentStore } from "./experiment-store";
import type { ExperimentRecord } from "./types";

function makeRecord(overrides: Partial<ExperimentRecord> = {}): ExperimentRecord {
  return {
    id: overrides.id ?? "exp-1",
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    status: "completed",
    hypothesis: {
      summary: "test",
      filesToModify: [],
      implementationPlan: "",
      expectedImpact: "",
      risks: "",
      benchmarkStrategy: "",
      mutationId: "temperature-adjust"
    },
    mutationId: "temperature-adjust",
    researchProvider: "mock",
    researchModel: "mock-model",
    gitBranch: "evolution/exp-1",
    result: "pending",
    logs: [],
    ...overrides
  };
}

describe("ExperimentStore", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-evo-store-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("saves and retrieves an experiment record by id", () => {
    const store = new ExperimentStore(root);
    store.save(makeRecord({ id: "exp-a" }));
    expect(store.get("exp-a")?.id).toBe("exp-a");
  });

  it("returns undefined for a record that does not exist", () => {
    const store = new ExperimentStore(root);
    expect(store.get("nope")).toBeUndefined();
  });

  it("lists records newest first", () => {
    const store = new ExperimentStore(root);
    store.save(makeRecord({ id: "old", createdAt: "2026-01-01T00:00:00.000Z" }));
    store.save(makeRecord({ id: "new", createdAt: "2026-06-01T00:00:00.000Z" }));

    const list = store.list();
    expect(list.map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("returns an empty list when no experiments have been stored yet", () => {
    const store = new ExperimentStore(root);
    expect(store.list()).toEqual([]);
    expect(store.acceptanceRate()).toBe(0);
    expect(store.leaderboard()).toEqual([]);
  });

  it("computes acceptance rate from decided experiments only", () => {
    const store = new ExperimentStore(root);
    store.save(makeRecord({ id: "a", result: "accepted" }));
    store.save(makeRecord({ id: "b", result: "rejected" }));
    store.save(makeRecord({ id: "c", result: "pending" }));

    expect(store.acceptanceRate()).toBe(0.5);
  });

  it("ranks the leaderboard by weighted overall score, accepted experiments only", () => {
    const store = new ExperimentStore(root);
    const metrics = (score: number) => ({
      latencyMs: 100,
      executionTimeMs: 100,
      toolCalls: 0,
      successRate: 1,
      failureRate: 0,
      compilationSuccess: true,
      benchmarkScore: score,
      weightedOverallScore: score
    });

    store.save(makeRecord({ id: "low", result: "accepted", metrics: metrics(0.4) }));
    store.save(makeRecord({ id: "high", result: "accepted", metrics: metrics(0.9) }));
    store.save(makeRecord({ id: "rejected", result: "rejected", metrics: metrics(0.99) }));

    const leaderboard = store.leaderboard();
    expect(leaderboard.map((r) => r.id)).toEqual(["high", "low"]);
  });

  it("uses the most recent completed experiment as the baseline", () => {
    const store = new ExperimentStore(root);
    store.save(makeRecord({ id: "first", createdAt: "2026-01-01T00:00:00.000Z", status: "completed", metrics: { latencyMs: 1, executionTimeMs: 1, toolCalls: 0, successRate: 1, failureRate: 0, compilationSuccess: true, benchmarkScore: 0.5, weightedOverallScore: 0.5 } }));
    store.save(makeRecord({ id: "second", createdAt: "2026-02-01T00:00:00.000Z", status: "completed", metrics: { latencyMs: 1, executionTimeMs: 1, toolCalls: 0, successRate: 1, failureRate: 0, compilationSuccess: true, benchmarkScore: 0.7, weightedOverallScore: 0.7 } }));

    expect(store.latestBaseline()?.id).toBe("second");
  });
});
