import { describe, expect, it } from "vitest";
import { buildOutcome, outcomeMemoryKey } from "./outcome";

describe("outcomeMemoryKey", () => {
  it("includes the agent, task id, and timestamp", () => {
    const key = outcomeMemoryKey("code", "t1", "2026-08-02T00:00:00.000Z");
    expect(key).toContain("outcome:code:t1:2026-08-02T00:00:00.000Z:");
  });

  it("is unique across calls even with identical agent/task/timestamp inputs", () => {
    const a = outcomeMemoryKey("code", "t1", "2026-08-02T00:00:00.000Z");
    const b = outcomeMemoryKey("code", "t1", "2026-08-02T00:00:00.000Z");
    expect(a).not.toBe(b);
  });
});

describe("buildOutcome", () => {
  it("marks a successful result as outcome 'success' and carries the output", () => {
    const outcome = buildOutcome({
      agent: "code",
      capability: "code",
      task: { id: "t1", description: "write a function" },
      result: { ok: true, output: "wrote it" },
      durationMs: 42,
      at: "2026-08-02T00:00:00.000Z"
    });

    expect(outcome).toEqual({
      agent: "code",
      capability: "code",
      taskId: "t1",
      description: "write a function",
      outcome: "success",
      output: "wrote it",
      error: undefined,
      durationMs: 42,
      at: "2026-08-02T00:00:00.000Z"
    });
  });

  it("marks a failed result as outcome 'failure' and carries the error", () => {
    const outcome = buildOutcome({
      agent: "testing",
      capability: "testing",
      task: { id: "t2", description: "run tests" },
      result: { ok: false, error: "tests failed" },
      durationMs: 10
    });

    expect(outcome.outcome).toBe("failure");
    expect(outcome.error).toBe("tests failed");
  });

  it("defaults 'at' to now when not given", () => {
    const before = Date.now();
    const outcome = buildOutcome({
      agent: "a",
      capability: "a",
      task: { id: "t3", description: "d" },
      result: { ok: true },
      durationMs: 1
    });
    expect(new Date(outcome.at).getTime()).toBeGreaterThanOrEqual(before);
  });
});
