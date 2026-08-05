import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HybridSearch } from "./hybrid-search";
import { MemoryManager } from "../memory/memory-manager";
import { KnowledgeGraph } from "../graph/knowledge-graph";
import { InboxManager } from "../inbox/inbox-manager";
import { MockProvider } from "../providers/mock-provider";

describe("HybridSearch", () => {
  let root: string;
  let memory: MemoryManager;
  let graph: KnowledgeGraph;
  let inbox: InboxManager;
  let search: HybridSearch;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-hybrid-search-"));
    memory = new MemoryManager(root);
    graph = new KnowledgeGraph(root);
    inbox = new InboxManager(memory);
    search = new HybridSearch(memory, graph, inbox);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns nothing across all three stores when empty", async () => {
    expect(await search.search("langgraph")).toEqual([]);
  });

  it("finds a matching memory record by value content", async () => {
    await memory.remember("project", "note-1", { text: "LangGraph is a great orchestration framework" });
    const results = await search.search("langgraph");
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe("memory");
    expect(results[0].title).toBe("note-1");
  });

  it("finds a matching graph node by label", async () => {
    graph.upsertNode({ kind: "technology", label: "LangGraph", tags: ["ai"] });
    const results = await search.search("langgraph");
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe("graph");
    expect(results[0].score).toBe(1); // exact (case-insensitive) label match
  });

  it("finds a matching inbox item by content", async () => {
    await inbox.capture("Check out LangGraph for multi-agent orchestration");
    const results = await search.search("langgraph");
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe("inbox");
  });

  it("merges and ranks hits from all three stores together, highest score first", async () => {
    await memory.remember("project", "note-1", { text: "something about langgraph internals" });
    graph.upsertNode({ kind: "technology", label: "LangGraph" }); // exact match -> score 1
    await inbox.capture("random langgraph thought");

    const results = await search.search("langgraph");
    expect(results).toHaveLength(3);
    expect(results[0].source).toBe("graph");
    expect(results.map((r) => r.source).sort()).toEqual(["graph", "inbox", "memory"]);
  });

  it("excludes non-matching records from all three stores", async () => {
    await memory.remember("project", "unrelated", { text: "something else entirely" });
    graph.upsertNode({ kind: "technology", label: "Kubernetes" });
    await inbox.capture("totally unrelated capture");

    expect(await search.search("langgraph")).toEqual([]);
  });

  it("respects the limit option across merged results", async () => {
    for (let i = 0; i < 5; i++) graph.upsertNode({ kind: "technology", label: `langgraph-variant-${i}` });
    const results = await search.search("langgraph", { limit: 2 });
    expect(results).toHaveLength(2);
  });

  it("matches by tag as well as title/content", async () => {
    graph.upsertNode({ kind: "problem", label: "some problem", tags: ["langgraph"] });
    await inbox.capture("a note", { tags: ["langgraph"] });

    const results = await search.search("langgraph");
    expect(results.map((r) => r.source).sort()).toEqual(["graph", "inbox"]);
  });

  it("semantic option falls back gracefully without a provider-backed embedding and still returns matches", async () => {
    const provider = new MockProvider();
    const memoryWithProvider = new MemoryManager(root, { provider });
    const inboxForProvider = new InboxManager(memoryWithProvider);
    const searchWithProvider = new HybridSearch(memoryWithProvider, graph, inboxForProvider);

    await memoryWithProvider.remember("project", "note-1", { text: "LangGraph orchestration notes" });
    const results = await searchWithProvider.search("langgraph", { semantic: true });
    expect(results.some((r) => r.source === "memory")).toBe(true);
  });
});
