import { describe, expect, it } from "vitest";
import { Evaluator } from "./evaluator";
import type { ExperimentMetrics } from "./types";

function metrics(overrides: Partial<Omit<ExperimentMetrics, "weightedOverallScore">> = {}) {
  return {
    latencyMs: 1000,
    executionTimeMs: 1000,
    toolCalls: 0,
    successRate: 1,
    failureRate: 0,
    compilationSuccess: true,
    benchmarkScore: 0.8,
    ...overrides
  };
}

describe("Evaluator.computeWeightedScore", () => {
  it("scores a fast, high-benchmark, fully-successful run near the top", () => {
    const evaluator = new Evaluator();
    const score = evaluator.computeWeightedScore(metrics({ latencyMs: 100, benchmarkScore: 1, successRate: 1 }));
    expect(score).toBeGreaterThan(0.9);
  });

  it("penalizes high latency", () => {
    const evaluator = new Evaluator({ maxAcceptableLatencyMs: 10_000 });
    const fast = evaluator.computeWeightedScore(metrics({ latencyMs: 100 }));
    const slow = evaluator.computeWeightedScore(metrics({ latencyMs: 9_000 }));
    expect(fast).toBeGreaterThan(slow);
  });

  it("penalizes high token usage", () => {
    const evaluator = new Evaluator({ maxAcceptableTokens: 1000 });
    const efficient = evaluator.computeWeightedScore(metrics({ tokenUsage: 50 }));
    const wasteful = evaluator.computeWeightedScore(metrics({ tokenUsage: 900 }));
    expect(efficient).toBeGreaterThan(wasteful);
  });

  it("never returns a score outside [0, 1] even for pathological inputs", () => {
    const evaluator = new Evaluator();
    const score = evaluator.computeWeightedScore(metrics({ latencyMs: 1_000_000, tokenUsage: 1_000_000, benchmarkScore: 0 }));
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe("Evaluator.compare", () => {
  it("accepts a candidate that meaningfully beats the baseline", () => {
    const evaluator = new Evaluator();
    const baseline = evaluator.finalize(metrics({ benchmarkScore: 0.5 }));
    const candidate = evaluator.finalize(metrics({ benchmarkScore: 0.9 }));

    const decision = evaluator.compare(baseline, candidate);
    expect(decision.accepted).toBe(true);
    expect(decision.delta).toBeGreaterThan(0);
  });

  it("rejects a candidate that fails to build, regardless of score", () => {
    const evaluator = new Evaluator();
    const baseline = evaluator.finalize(metrics({ benchmarkScore: 0.3 }));
    const candidate = evaluator.finalize(metrics({ benchmarkScore: 1, compilationSuccess: false }));

    const decision = evaluator.compare(baseline, candidate);
    expect(decision.accepted).toBe(false);
    expect(decision.reason).toMatch(/failed to build/);
  });

  it("rejects a candidate with failing tests when requireTests is set, even with a higher score", () => {
    const evaluator = new Evaluator();
    const baseline = evaluator.finalize(metrics({ benchmarkScore: 0.3 }));
    const candidate = evaluator.finalize(metrics({ benchmarkScore: 1, testsFailed: 2 }));

    const decision = evaluator.compare(baseline, candidate, true);
    expect(decision.accepted).toBe(false);
    expect(decision.reason).toMatch(/failing test/);
  });

  it("ignores failing tests when requireTests is false", () => {
    const evaluator = new Evaluator();
    const baseline = evaluator.finalize(metrics({ benchmarkScore: 0.3 }));
    const candidate = evaluator.finalize(metrics({ benchmarkScore: 1, testsFailed: 2 }));

    const decision = evaluator.compare(baseline, candidate, false);
    expect(decision.accepted).toBe(true);
  });

  it("rejects a candidate that is not meaningfully better than baseline", () => {
    const evaluator = new Evaluator({ minImprovement: 0.05 });
    const baseline = evaluator.finalize(metrics({ benchmarkScore: 0.8 }));
    const candidate = evaluator.finalize(metrics({ benchmarkScore: 0.81 }));

    const decision = evaluator.compare(baseline, candidate);
    expect(decision.accepted).toBe(false);
    expect(decision.reason).toMatch(/no meaningful improvement/);
  });

  it("rejects a candidate that regresses", () => {
    const evaluator = new Evaluator();
    const baseline = evaluator.finalize(metrics({ benchmarkScore: 0.9 }));
    const candidate = evaluator.finalize(metrics({ benchmarkScore: 0.4 }));

    const decision = evaluator.compare(baseline, candidate);
    expect(decision.accepted).toBe(false);
    expect(decision.delta).toBeLessThan(0);
  });
});
