import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../kernel/event-bus";
import { MemoryManager } from "../memory/memory-manager";
import { KnowledgeGraph } from "../graph/knowledge-graph";
import { InboxManager } from "../inbox/inbox-manager";
import { VaultManager } from "./vault-manager";

describe("VaultManager", () => {
  let root: string;
  let memory: MemoryManager;
  let eventBus: EventBus;
  let graph: KnowledgeGraph;
  let vault: VaultManager;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-vault-"));
    memory = new MemoryManager(root, { globalDir: root });
    eventBus = new EventBus();
    graph = new KnowledgeGraph(root);
    vault = new VaultManager(memory, { eventBus, graph });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("creates a note with default status active", async () => {
    const note = await vault.create("Rate limiting", "Token bucket vs sliding window.");
    expect(note.id).toBeTruthy();
    expect(note.title).toBe("Rate limiting");
    expect(note.status).toBe("active");
    expect(note.links).toEqual([]);
  });

  it("rejects an empty title", async () => {
    await expect(vault.create("   ", "content")).rejects.toThrow(/empty/);
  });

  it("persists notes via MemoryManager and round-trips through get()", async () => {
    const created = await vault.create("A note", "some content");
    expect(vault.get(created.id)).toEqual(created);
  });

  it("lists notes newest first", async () => {
    const first = await vault.create("First", "one");
    await new Promise((r) => setTimeout(r, 2));
    const second = await vault.create("Second", "two");
    const list = vault.list();
    expect(list[0].id).toBe(second.id);
    expect(list[1].id).toBe(first.id);
  });

  it("filters list by status and tag", async () => {
    const toArchive = await vault.create("Archive me", "x", { tags: ["keep"] });
    await vault.create("Stays active", "y", { tags: ["other"] });
    await vault.archive(toArchive.id);

    expect(vault.list({ status: "archived" })).toHaveLength(1);
    expect(vault.list({ status: "active" })).toHaveLength(1);
    expect(vault.list({ tag: "other" })).toHaveLength(1);
  });

  it("archive updates status", async () => {
    const note = await vault.create("Archive me", "content");
    const archived = await vault.archive(note.id);
    expect(archived.status).toBe("archived");
    expect(archived.id).toBe(note.id);
  });

  it("throws when archiving an unknown id", async () => {
    await expect(vault.archive("does-not-exist")).rejects.toThrow(/not found/);
  });

  it("links two notes bidirectionally-discoverable via backlinks", async () => {
    const a = await vault.create("A", "content a");
    const b = await vault.create("B", "content b");

    const linked = await vault.link(a.id, b.id);
    expect(linked.links).toEqual([b.id]);
    expect(vault.backlinks(b.id).map((n) => n.id)).toEqual([a.id]);
  });

  it("history() is empty for a note that's never been updated", async () => {
    const note = await vault.create("A", "content a");
    expect(vault.history(note.id)).toEqual([]);
  });

  it("history() returns prior versions of a note, newest first", async () => {
    const a = await vault.create("A", "content a");
    const b = await vault.create("B", "content b");
    await vault.link(a.id, b.id); // mutates and re-persists `a`
    await vault.archive(a.id); // mutates and re-persists `a` again

    const history = vault.history(a.id);
    expect(history).toHaveLength(2);
    expect(history[0].status).toBe("active");
    expect(history[0].links).toEqual([b.id]);
    expect(history[1].links).toEqual([]);
    expect(vault.get(a.id)?.status).toBe("archived");
  });

  it("linking the same pair twice is idempotent", async () => {
    const a = await vault.create("A", "content a");
    const b = await vault.create("B", "content b");

    await vault.link(a.id, b.id);
    const linked = await vault.link(a.id, b.id);
    expect(linked.links).toEqual([b.id]);
  });

  it("throws when linking to/from an unknown note id", async () => {
    const a = await vault.create("A", "content a");
    await expect(vault.link(a.id, "does-not-exist")).rejects.toThrow(/not found/);
    await expect(vault.link("does-not-exist", a.id)).rejects.toThrow(/not found/);
  });

  it("emits vault:created, vault:updated, and vault:linked events", async () => {
    const seen: string[] = [];
    eventBus.on("vault:created", () => seen.push("created"));
    eventBus.on("vault:updated", () => seen.push("updated"));
    eventBus.on("vault:linked", () => seen.push("linked"));

    const a = await vault.create("A", "content a");
    const b = await vault.create("B", "content b");
    await vault.archive(a.id);
    await vault.link(b.id, a.id);

    expect(seen).toEqual(["created", "created", "updated", "linked"]);
  });

  it("best-effort enriches the knowledge graph with a note node", async () => {
    await vault.create("Rate limiting", "content", { tags: ["backend"] });
    const nodes = graph.listNodes({ kind: "note" });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].label).toBe("Rate limiting");
    expect(nodes[0].tags).toContain("backend");
  });

  it("adds a relates-to edge between linked notes' graph nodes", async () => {
    const a = await vault.create("A", "content a");
    const b = await vault.create("B", "content b");
    await vault.link(a.id, b.id);

    const nodeA = graph.listNodes({ kind: "note" }).find((n) => n.label === "A")!;
    const edges = graph.listEdges();
    expect(edges.some((e) => e.from === nodeA.id && e.kind === "relates-to")).toBe(true);
  });

  it("works without a graph or event bus (both optional)", async () => {
    const bare = new VaultManager(memory);
    const note = await bare.create("bare note", "content");
    expect(note.status).toBe("active");
  });

  describe("promoteFromInbox", () => {
    it("creates a note from an inbox item, carrying its content and tags forward", async () => {
      const inbox = new InboxManager(memory);
      const item = await inbox.capture("Check out LangGraph for orchestration", { tags: ["ai"] });

      const note = await vault.promoteFromInbox(item.id);
      expect(note.content).toBe(item.content);
      expect(note.tags).toContain("ai");
      expect(note.sourceInboxId).toBe(item.id);
    });

    it("marks the source inbox item as reviewed", async () => {
      const inbox = new InboxManager(memory);
      const item = await inbox.capture("a note worth keeping");

      await vault.promoteFromInbox(item.id);
      expect(inbox.get(item.id)?.status).toBe("reviewed");
    });

    it("uses an explicit title override when given", async () => {
      const inbox = new InboxManager(memory);
      const item = await inbox.capture("a note worth keeping");

      const note = await vault.promoteFromInbox(item.id, { title: "My custom title" });
      expect(note.title).toBe("My custom title");
    });

    it("throws for an unknown inbox id", async () => {
      await expect(vault.promoteFromInbox("does-not-exist")).rejects.toThrow(/not found/);
    });

    it("links the resulting note's graph node to the inbox item's resource node", async () => {
      const inbox = new InboxManager(memory, { graph });
      const item = await inbox.capture("a note worth keeping");

      const note = await vault.promoteFromInbox(item.id);
      const noteNode = graph.listNodes({ kind: "note" }).find((n) => n.data?.vaultId === note.id)!;
      const edges = graph.listEdges();
      expect(edges.some((e) => e.from === noteNode.id && e.kind === "relates-to")).toBe(true);
    });
  });
});
