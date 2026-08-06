import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HybridSearch } from "./hybrid-search";
import { MemoryManager } from "../memory/memory-manager";
import { KnowledgeGraph } from "../graph/knowledge-graph";
import { InboxManager } from "../inbox/inbox-manager";
import { VaultManager } from "../vault/vault-manager";
import { WorkspaceManager } from "../workspace/workspace-manager";
import { LearningManager } from "../learning/learning-manager";
import { MockProvider } from "../providers/mock-provider";

describe("HybridSearch", () => {
  let root: string;
  let memory: MemoryManager;
  let graph: KnowledgeGraph;
  let inbox: InboxManager;
  let vault: VaultManager;
  let workspace: WorkspaceManager;
  let learning: LearningManager;
  let search: HybridSearch;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-hybrid-search-"));
    memory = new MemoryManager(root);
    graph = new KnowledgeGraph(root);
    inbox = new InboxManager(memory);
    vault = new VaultManager(memory);
    workspace = new WorkspaceManager(memory);
    learning = new LearningManager(memory);
    search = new HybridSearch(memory, graph, inbox, vault, workspace, learning);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns nothing across all six stores when empty", async () => {
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

  it("finds a matching vault note by title or content", async () => {
    await vault.create("LangGraph notes", "some content");
    const byTitle = await search.search("langgraph");
    expect(byTitle).toHaveLength(1);
    expect(byTitle[0].source).toBe("vault");

    await vault.create("Other note", "mentions langgraph internals somewhere");
    const results = await search.search("langgraph");
    expect(results.map((r) => r.source).sort()).toEqual(["vault", "vault"]);
  });

  it("finds a matching workspace project, task, and milestone", async () => {
    const project = await workspace.createProject("LangGraph rollout", "adopt langgraph internally");
    const results = await search.search("langgraph");
    expect(results.every((r) => r.source === "workspace")).toBe(true);
    expect(results.length).toBeGreaterThan(0);

    await workspace.addTask(project.id, "Evaluate langgraph vs alternatives");
    await workspace.addMilestone(project.id, "langgraph pilot complete");
    const afterMore = await search.search("langgraph");
    expect(afterMore.map((r) => r.source)).toEqual(["workspace", "workspace", "workspace"]);
  });

  it("finds a matching learning resource and flashcard", async () => {
    await learning.addResource("LangGraph course", "course");
    const afterResource = await search.search("langgraph");
    expect(afterResource.every((r) => r.source === "learning")).toBe(true);
    expect(afterResource.length).toBeGreaterThan(0);

    await learning.addCard("What is LangGraph?", "An orchestration framework");
    const afterCard = await search.search("langgraph");
    expect(afterCard.map((r) => r.source)).toEqual(["learning", "learning"]);
  });

  it("merges and ranks hits from all six stores together, highest score first", async () => {
    await memory.remember("project", "note-1", { text: "something about langgraph internals" });
    graph.upsertNode({ kind: "technology", label: "LangGraph" }); // exact match -> score 1
    await inbox.capture("random langgraph thought");
    await vault.create("Vault note", "langgraph reference content");
    await workspace.createProject("Langgraph project", "reference content");
    await learning.addResource("Langgraph resource", "article", { notes: "reference content" });

    const results = await search.search("langgraph");
    expect(results).toHaveLength(6);
    expect(results[0].source).toBe("graph");
    expect(results.map((r) => r.source).sort()).toEqual(["graph", "inbox", "learning", "memory", "vault", "workspace"]);
  });

  it("excludes non-matching records from all six stores", async () => {
    await memory.remember("project", "unrelated", { text: "something else entirely" });
    graph.upsertNode({ kind: "technology", label: "Kubernetes" });
    await inbox.capture("totally unrelated capture");
    await vault.create("Unrelated note", "nothing to see here");
    await workspace.createProject("Unrelated project", "nothing to see here");
    await learning.addResource("Unrelated resource", "book");

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
    await vault.create("A note", "content", { tags: ["langgraph"] });
    await workspace.createProject("A project", "content", { tags: ["langgraph"] });
    await learning.addResource("A resource", "book", { tags: ["langgraph"] });

    const results = await search.search("langgraph");
    expect(results.map((r) => r.source).sort()).toEqual(["graph", "inbox", "learning", "vault", "workspace"]);
  });

  it("semantic option falls back gracefully without a provider-backed embedding and still returns matches", async () => {
    const results = await search.search("langgraph", { semantic: true });
    expect(results).toEqual([]);

    await memory.remember("project", "note-1", { text: "LangGraph orchestration notes" });
    const afterCapture = await search.search("langgraph", { semantic: true });
    expect(afterCapture.some((r) => r.source === "memory")).toBe(true);
  });

  describe("semantic mode with a real embedding provider", () => {
    let semanticSearch: HybridSearch;
    let semanticMemory: MemoryManager;
    let semanticInbox: InboxManager;
    let semanticVault: VaultManager;
    let semanticWorkspace: WorkspaceManager;
    let semanticLearning: LearningManager;

    beforeEach(() => {
      const provider = new MockProvider();
      semanticMemory = new MemoryManager(root, { provider });
      semanticInbox = new InboxManager(semanticMemory);
      semanticVault = new VaultManager(semanticMemory);
      semanticWorkspace = new WorkspaceManager(semanticMemory);
      semanticLearning = new LearningManager(semanticMemory);
      semanticSearch = new HybridSearch(semanticMemory, graph, semanticInbox, semanticVault, semanticWorkspace, semanticLearning);
    });

    it("routes an inbox item through its own hit shape, not a raw memory hit", async () => {
      await semanticInbox.capture("Check out LangGraph for multi-agent orchestration");
      const results = await semanticSearch.search("langgraph", { semantic: true });
      const hit = results.find((r) => r.source === "inbox");
      expect(hit).toBeDefined();
      expect(hit!.title).toContain("LangGraph");
      expect(results.some((r) => r.source === "memory" && r.title.startsWith("inbox:"))).toBe(false);
    });

    it("routes a vault note through its own hit shape", async () => {
      await semanticVault.create("LangGraph notes", "some content about orchestration");
      const results = await semanticSearch.search("langgraph", { semantic: true });
      const hit = results.find((r) => r.source === "vault");
      expect(hit).toBeDefined();
      expect(hit!.title).toBe("LangGraph notes");
    });

    it("routes a workspace project, task, and milestone through their own hit shapes", async () => {
      const project = await semanticWorkspace.createProject("LangGraph rollout", "adopt langgraph internally");
      await semanticWorkspace.addTask(project.id, "Evaluate langgraph vs alternatives");
      await semanticWorkspace.addMilestone(project.id, "langgraph pilot complete");

      const results = await semanticSearch.search("langgraph", { semantic: true });
      const workspaceHits = results.filter((r) => r.source === "workspace");
      expect(workspaceHits.length).toBe(3);
      expect(workspaceHits.some((r) => r.snippet.startsWith("[task/"))).toBe(true);
      expect(workspaceHits.some((r) => r.snippet.startsWith("[milestone/"))).toBe(true);
    });

    it("routes a learning resource and flashcard through their own hit shapes", async () => {
      await semanticLearning.addResource("LangGraph course", "course");
      await semanticLearning.addCard("What is LangGraph?", "An orchestration framework");

      const results = await semanticSearch.search("langgraph", { semantic: true });
      const learningHits = results.filter((r) => r.source === "learning");
      expect(learningHits.length).toBe(2);
      expect(learningHits.some((r) => r.snippet.startsWith("[flashcard]"))).toBe(true);
    });

    it("still matches Graph nodes by keyword even in semantic mode", async () => {
      graph.upsertNode({ kind: "technology", label: "LangGraph" });
      const results = await semanticSearch.search("langgraph", { semantic: true });
      expect(results.some((r) => r.source === "graph")).toBe(true);
    });

    it("leaves an unrelated, non-subsystem memory record as a generic memory hit", async () => {
      await semanticMemory.remember("project", "note-1", { text: "LangGraph orchestration notes" });
      const results = await semanticSearch.search("langgraph", { semantic: true });
      const memoryHit = results.find((r) => r.source === "memory");
      expect(memoryHit).toBeDefined();
      expect(memoryHit!.title).toBe("note-1");
    });
  });
});
