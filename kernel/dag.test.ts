import { describe, expect, it } from "vitest";
import { DagExecutor } from "./dag";

describe("DagExecutor", () => {
  it("runs independent nodes and resolves dependency order", async () => {
    const order: string[] = [];
    const dag = new DagExecutor([
      { id: "a", run: async () => { order.push("a"); return 1; } },
      { id: "b", dependsOn: ["a"], run: async (ctx) => { order.push("b"); return (ctx.results.get("a") as number) + 1; } },
      { id: "c", dependsOn: ["a"], run: async () => { order.push("c"); return 3; } },
      { id: "d", dependsOn: ["b", "c"], run: async (ctx) => (ctx.results.get("b") as number) + (ctx.results.get("c") as number) }
    ]);

    const results = await dag.run();
    expect(order[0]).toBe("a");
    expect(results.get("d")?.status).toBe("success");
    expect(results.get("d")?.result).toBe(5);
  });

  it("retries failing nodes up to the configured limit", async () => {
    let attempts = 0;
    const dag = new DagExecutor([
      {
        id: "flaky",
        retries: 2,
        retryDelayMs: 1,
        run: async () => {
          attempts++;
          if (attempts < 3) throw new Error("boom");
          return "ok";
        }
      }
    ]);

    const results = await dag.run();
    expect(attempts).toBe(3);
    expect(results.get("flaky")?.status).toBe("success");
  });

  it("skips downstream nodes when a dependency fails permanently", async () => {
    const dag = new DagExecutor([
      { id: "a", run: async () => { throw new Error("nope"); } },
      { id: "b", dependsOn: ["a"], run: async () => "should not run" }
    ]);

    const results = await dag.run();
    expect(results.get("a")?.status).toBe("failed");
    expect(results.get("b")?.status).toBe("skipped");
  });

  it("invokes rollback on permanent failure", async () => {
    let rolledBack = false;
    const dag = new DagExecutor([
      {
        id: "a",
        rollback: () => {
          rolledBack = true;
        },
        run: async () => {
          throw new Error("fail");
        }
      }
    ]);
    await dag.run();
    expect(rolledBack).toBe(true);
  });

  it("throws when a node depends on an unknown node", () => {
    expect(
      () =>
        new DagExecutor([{ id: "a", dependsOn: ["missing"], run: async () => 1 }])
    ).toThrow(/unknown node/);
  });
});
