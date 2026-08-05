import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReflectionAgent } from "./reflection-agent";
import { BaseAgent } from "./base-agent";
import { InboxManager } from "../inbox/inbox-manager";
import { MemoryManager } from "../memory/memory-manager";
import { KnowledgeGraph } from "../graph/knowledge-graph";
import { ToolRegistry } from "../tools/registry";
import { MockProvider } from "../providers/mock-provider";
import type { AgentContext } from "./types";
import type { ReflectionData } from "./reflection";

describe("ReflectionAgent", () => {
  let root: string;
  let context: AgentContext;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-reflection-agent-"));
    context = { provider: new MockProvider(), tools: new ToolRegistry(), cwd: root };
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("defaults to a daily period and reports nothing recorded when empty", async () => {
    const agent = new ReflectionAgent();
    const result = await agent.execute({ id: "t1", description: "reflect" }, context);

    expect(result.ok).toBe(true);
    expect(result.output).toBe("Nothing recorded today yet.");
    const data = result.data as ReflectionData;
    expect(data.period).toBe("daily");
  });

  it("falls back to weekly/monthly labels for unrecognized empty periods", async () => {
    const agent = new ReflectionAgent();
    const weekly = await agent.execute({ id: "t1", description: "reflect", input: { period: "weekly" } }, context);
    expect(weekly.output).toBe("Nothing recorded this week yet.");

    const monthly = await agent.execute({ id: "t2", description: "reflect", input: { period: "monthly" } }, context);
    expect(monthly.output).toBe("Nothing recorded this month yet.");
  });

  it("falls back to daily for an unknown requested period", async () => {
    const agent = new ReflectionAgent();
    const result = await agent.execute({ id: "t1", description: "reflect", input: { period: "yearly" } }, context);
    expect((result.data as ReflectionData).period).toBe("daily");
  });

  it("summarizes real Inbox and Knowledge Graph activity via the mock provider narrative", async () => {
    const memory = new MemoryManager(root);
    const inbox = new InboxManager(memory);
    await inbox.capture("A captured idea");

    const graph = new KnowledgeGraph(root);
    graph.upsertNode({ kind: "project", label: root });

    const agent = new ReflectionAgent();
    const result = await agent.execute({ id: "t1", description: "reflect" }, context);

    expect(result.ok).toBe(true);
    const data = result.data as ReflectionData;
    expect(data.inbox.captured).toBe(1);
    expect(data.knowledgeGraph.newNodes).toBeGreaterThanOrEqual(1);
    // MockProvider echoes deterministically — confirms the LLM path (not the empty fallback) was taken.
    expect(result.output).not.toBe("Nothing recorded today yet.");
  });

  it("reflects real Outcome Memory failures written by another agent's execute()", async () => {
    const memory = new MemoryManager(root);
    class FlakyAgent extends BaseAgent {
      name = "flaky";
      description = "always fails";
      capabilities = ["flaky"];
      async run() {
        return { ok: false, error: "boom" };
      }
    }
    const flaky = new FlakyAgent();
    await flaky.execute({ id: "task-1", description: "do a flaky thing" }, { ...context, memory });

    const agent = new ReflectionAgent();
    const result = await agent.execute({ id: "t2", description: "reflect" }, context);
    const data = result.data as ReflectionData;
    expect(data.outcomes.total).toBe(1);
    expect(data.outcomes.failure).toBe(1);
    expect(data.outcomes.failures[0]).toEqual({ agent: "flaky", description: "do a flaky thing", error: "boom" });
  });
});
