import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../kernel/event-bus";
import { MemoryManager } from "../memory/memory-manager";
import { KnowledgeGraph } from "../graph/knowledge-graph";
import { InboxManager } from "./inbox-manager";

describe("InboxManager", () => {
  let root: string;
  let memory: MemoryManager;
  let eventBus: EventBus;
  let graph: KnowledgeGraph;
  let inbox: InboxManager;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-inbox-"));
    memory = new MemoryManager(root, { globalDir: root });
    eventBus = new EventBus();
    graph = new KnowledgeGraph(root);
    inbox = new InboxManager(memory, { eventBus, graph });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("captures text content and auto-classifies it", async () => {
    const item = await inbox.capture("a random thought worth remembering");
    expect(item.sourceType).toBe("text");
    expect(item.status).toBe("unread");
    expect(item.id).toBeTruthy();
  });

  it("classifies a captured URL as a github-repo", async () => {
    const item = await inbox.capture("https://github.com/anthropics/claude-code");
    expect(item.sourceType).toBe("github-repo");
    expect(item.tags).toContain("github");
  });

  it("rejects empty content", async () => {
    await expect(inbox.capture("   ")).rejects.toThrow(/empty/);
  });

  it("merges explicit tags with auto-detected ones", async () => {
    const item = await inbox.capture("https://example.com/post", { tags: ["reading-list"] });
    expect(item.tags).toEqual(expect.arrayContaining(["reading-list", "link"]));
  });

  it("persists items via MemoryManager and round-trips through get()", async () => {
    const captured = await inbox.capture("hello inbox");
    expect(inbox.get(captured.id)).toEqual(captured);
  });

  it("lists items newest first", async () => {
    const first = await inbox.capture("first item");
    await new Promise((r) => setTimeout(r, 2));
    const second = await inbox.capture("second item");
    const list = inbox.list();
    expect(list[0].id).toBe(second.id);
    expect(list[1].id).toBe(first.id);
  });

  it("filters list by status", async () => {
    const item = await inbox.capture("to archive");
    await inbox.capture("stays unread");
    await inbox.archive(item.id);

    expect(inbox.list({ status: "archived" })).toHaveLength(1);
    expect(inbox.list({ status: "unread" })).toHaveLength(1);
  });

  it("archive updates status", async () => {
    const item = await inbox.capture("archive me");
    const archived = await inbox.archive(item.id);
    expect(archived.status).toBe("archived");
    expect(archived.id).toBe(item.id);
  });

  it("throws when updating the status of an unknown id", async () => {
    await expect(inbox.updateStatus("does-not-exist", "reviewed")).rejects.toThrow(/not found/);
  });

  it("emits inbox:captured and inbox:updated events", async () => {
    const captured: string[] = [];
    eventBus.on("inbox:captured", () => captured.push("captured"));
    eventBus.on("inbox:updated", () => captured.push("updated"));

    const item = await inbox.capture("watch me");
    await inbox.archive(item.id);

    expect(captured).toEqual(["captured", "updated"]);
  });

  it("best-effort enriches the knowledge graph with a resource node", async () => {
    await inbox.capture("a plain captured note");
    const nodes = graph.listNodes({ kind: "resource" });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].label).toContain("a plain captured note");
  });

  it("links a github-repo resource node to a repository node", async () => {
    await inbox.capture("https://github.com/anthropics/claude-code");
    const repoNodes = graph.listNodes({ kind: "repository" });
    expect(repoNodes).toHaveLength(1);
    expect(repoNodes[0].label).toBe("anthropics/claude-code");
  });

  it("works without a graph or event bus (both optional)", async () => {
    const bare = new InboxManager(memory);
    const item = await bare.capture("no graph, no bus");
    expect(item.sourceType).toBe("text");
  });
});
