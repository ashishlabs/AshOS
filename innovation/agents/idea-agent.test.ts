import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IdeaAgent } from "./idea-agent";
import { InboxManager } from "../../inbox/inbox-manager";
import { MemoryManager } from "../../memory/memory-manager";
import { OpportunityStore } from "../history/opportunity-store";
import { KnowledgeGraph } from "../../graph/knowledge-graph";
import { EventBus } from "../../kernel/event-bus";
import { ToolRegistry } from "../../tools/registry";
import { MockProvider } from "../../providers/mock-provider";
import type { AgentContext } from "../../agents/types";
import type { Opportunity } from "../types";

describe("IdeaAgent", () => {
  let root: string;
  let context: AgentContext;
  let eventBus: EventBus;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-idea-agent-"));
    eventBus = new EventBus();
    context = { provider: new MockProvider(), tools: new ToolRegistry(), cwd: root, eventBus };
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("fails without an inboxId or content", async () => {
    const agent = new IdeaAgent();
    const result = await agent.execute({ id: "t1", description: "idea" }, context);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/inboxId.*content/);
  });

  it("fails when inboxId doesn't exist", async () => {
    const agent = new IdeaAgent();
    const result = await agent.execute({ id: "t1", description: "idea", input: { inboxId: "does-not-exist" } }, context);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found/);
  });

  it("creates a new opportunity from raw content", async () => {
    const agent = new IdeaAgent();
    const result = await agent.execute({ id: "t1", description: "idea", input: { content: "A tool that summarizes long PRs automatically" } }, context);

    expect(result.ok).toBe(true);
    const data = result.data as { opportunity: Opportunity; created: boolean };
    expect(data.created).toBe(true);
    expect(data.opportunity.title).toContain("A tool that summarizes long PRs");
    expect(data.opportunity.stage).toBe("captured");
    expect(data.opportunity.score.overall).toBeGreaterThan(0);

    const store = new OpportunityStore(root);
    expect(store.list()).toHaveLength(1);
  });

  it("promotes an inbox item, links its content, and marks it reviewed", async () => {
    const memory = new MemoryManager(root);
    const inbox = new InboxManager(memory);
    const item = await inbox.capture("Build a CLI that turns meeting notes into action items", { tags: ["productivity"] });

    const agent = new IdeaAgent();
    const result = await agent.execute({ id: "t1", description: "idea", input: { inboxId: item.id } }, context);

    expect(result.ok).toBe(true);
    const data = result.data as { opportunity: Opportunity };
    expect(data.opportunity.tags).toContain("productivity");
    expect(data.opportunity.signals[0].source).toBe(`inbox:${item.id}`);

    expect(inbox.get(item.id)!.status).toBe("reviewed");
  });

  it("merges a second overlapping idea into the same opportunity instead of creating a new one", async () => {
    const agent = new IdeaAgent();
    const first = await agent.execute(
      { id: "t1", description: "idea", input: { content: "Automate PR review summaries", tags: ["dev-tools", "automation"] } },
      context
    );
    const second = await agent.execute(
      { id: "t2", description: "idea", input: { content: "Auto-summarize pull requests for reviewers", tags: ["dev-tools", "automation"], mergeThreshold: 0.3 } },
      context
    );

    const firstData = first.data as { opportunity: Opportunity; created: boolean };
    const secondData = second.data as { opportunity: Opportunity; created: boolean };
    expect(firstData.created).toBe(true);
    expect(secondData.created).toBe(false);
    expect(secondData.opportunity.id).toBe(firstData.opportunity.id);
    expect(secondData.opportunity.signals).toHaveLength(2);

    expect(new OpportunityStore(root).list()).toHaveLength(1);
  });

  it("defaults domain to workflow but honors an explicit known domain", async () => {
    const agent = new IdeaAgent();
    const defaulted = await agent.execute({ id: "t1", description: "idea", input: { content: "idea one" } }, context);
    const explicit = await agent.execute({ id: "t2", description: "idea", input: { content: "idea two", domain: "market" } }, context);

    expect((defaulted.data as { opportunity: Opportunity }).opportunity.domains).toEqual(["workflow"]);
    expect((explicit.data as { opportunity: Opportunity }).opportunity.domains).toEqual(["market"]);
  });

  it("ignores an unknown requested domain and falls back to workflow", async () => {
    const agent = new IdeaAgent();
    const result = await agent.execute({ id: "t1", description: "idea", input: { content: "idea", domain: "not-a-real-domain" } }, context);
    expect((result.data as { opportunity: Opportunity }).opportunity.domains).toEqual(["workflow"]);
  });

  it("records a problem node and per-tag technology nodes in the namespaced innovation graph", async () => {
    const agent = new IdeaAgent();
    await agent.execute({ id: "t1", description: "idea", input: { content: "Build a smarter changelog generator", tags: ["dx"] } }, context);

    const graph = new KnowledgeGraph(root, { namespace: "innovation" });
    expect(graph.listNodes({ kind: "problem" })).toHaveLength(1);
    expect(graph.listNodes({ kind: "technology" }).map((n) => n.label)).toContain("dx");
  });

  it("emits innovation:opportunity-created and innovation:event-created on the event bus", async () => {
    const seen: string[] = [];
    eventBus.on("innovation:opportunity-created", () => seen.push("opportunity-created"));
    eventBus.on("innovation:event-created", () => seen.push("event-created"));

    const agent = new IdeaAgent();
    await agent.execute({ id: "t1", description: "idea", input: { content: "A new idea" } }, context);

    expect(seen).toEqual(expect.arrayContaining(["opportunity-created", "event-created"]));
  });
});
