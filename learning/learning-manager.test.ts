import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../kernel/event-bus";
import { MemoryManager } from "../memory/memory-manager";
import { KnowledgeGraph } from "../graph/knowledge-graph";
import { LearningManager } from "./learning-manager";

describe("LearningManager", () => {
  let root: string;
  let memory: MemoryManager;
  let eventBus: EventBus;
  let graph: KnowledgeGraph;
  let learning: LearningManager;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-learning-"));
    memory = new MemoryManager(root, { globalDir: root });
    eventBus = new EventBus();
    graph = new KnowledgeGraph(root);
    learning = new LearningManager(memory, { eventBus, graph });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe("resources", () => {
    it("adds a resource with default status to-learn", async () => {
      const resource = await learning.addResource("Deep Learning Specialization", "course", { url: "https://example.com" });
      expect(resource.id).toBeTruthy();
      expect(resource.type).toBe("course");
      expect(resource.status).toBe("to-learn");
    });

    it("rejects an empty title", async () => {
      await expect(learning.addResource("  ", "book")).rejects.toThrow(/empty/);
    });

    it("persists resources via MemoryManager and round-trips through getResource()", async () => {
      const created = await learning.addResource("A book", "book");
      expect(learning.getResource(created.id)).toEqual(created);
    });

    it("lists resources newest first, filterable by status and type", async () => {
      const first = await learning.addResource("First", "book");
      await new Promise((r) => setTimeout(r, 2));
      const second = await learning.addResource("Second", "video");
      await learning.updateResourceStatus(first.id, "completed");

      const all = learning.listResources();
      expect(all[0].id).toBe(second.id);
      expect(all[1].id).toBe(first.id);
      expect(learning.listResources({ status: "completed" })).toHaveLength(1);
      expect(learning.listResources({ type: "video" })).toHaveLength(1);
    });

    it("updateResourceStatus updates status", async () => {
      const resource = await learning.addResource("A course", "course");
      const updated = await learning.updateResourceStatus(resource.id, "in-progress");
      expect(updated.status).toBe("in-progress");
    });

    it("throws when updating the status of an unknown resource", async () => {
      await expect(learning.updateResourceStatus("does-not-exist", "completed")).rejects.toThrow(/not found/);
    });

    it("resourceHistory() reflects the prior version after a status update", async () => {
      const resource = await learning.addResource("A course", "course");
      expect(learning.resourceHistory(resource.id)).toEqual([]);

      await learning.updateResourceStatus(resource.id, "in-progress");
      const history = learning.resourceHistory(resource.id);
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe("to-learn");
    });

    it("best-effort enriches the knowledge graph with a learning-resource node", async () => {
      await learning.addResource("Deep Learning Specialization", "course", { tags: ["ml"] });
      const nodes = graph.listNodes({ kind: "learning-resource" });
      expect(nodes).toHaveLength(1);
      expect(nodes[0].label).toBe("Deep Learning Specialization");
      expect(nodes[0].tags).toContain("ml");
      expect(nodes[0].tags).toContain("course");
    });

    it("works without a graph or event bus (both optional)", async () => {
      const bare = new LearningManager(memory);
      const resource = await bare.addResource("bare resource", "article");
      expect(resource.status).toBe("to-learn");
    });
  });

  describe("flashcards", () => {
    it("adds a card due immediately with default SRS state", async () => {
      const card = await learning.addCard("What is SM-2?", "A spaced repetition algorithm");
      expect(card.interval).toBe(0);
      expect(card.easeFactor).toBe(2.5);
      expect(card.repetitions).toBe(0);
      expect(card.reviewCount).toBe(0);
    });

    it("rejects an empty front or back", async () => {
      await expect(learning.addCard("", "back")).rejects.toThrow(/empty/);
      await expect(learning.addCard("front", "  ")).rejects.toThrow(/empty/);
    });

    it("persists cards via MemoryManager and round-trips through getCard()", async () => {
      const created = await learning.addCard("front", "back");
      expect(learning.getCard(created.id)).toEqual(created);
    });

    it("a newly created card is due for review", async () => {
      const card = await learning.addCard("front", "back");
      expect(learning.listCards({ due: true }).map((c) => c.id)).toContain(card.id);
    });

    it("throws when reviewing an unknown card", async () => {
      await expect(learning.reviewCard("does-not-exist", "good")).rejects.toThrow(/not found/);
    });

    it("a 'good' review schedules the next review and updates SRS state", async () => {
      const card = await learning.addCard("front", "back");
      const reviewed = await learning.reviewCard(card.id, "good");
      expect(reviewed.repetitions).toBe(1);
      expect(reviewed.interval).toBe(1);
      expect(reviewed.reviewCount).toBe(1);
      expect(reviewed.lastReviewedAt).toBeTruthy();
      expect(new Date(reviewed.dueDate).getTime()).toBeGreaterThan(new Date(card.createdAt).getTime());
    });

    it("an 'again' review keeps repetitions at 0 and schedules review for tomorrow", async () => {
      const card = await learning.addCard("front", "back");
      const reviewed = await learning.reviewCard(card.id, "again");
      expect(reviewed.repetitions).toBe(0);
      expect(reviewed.interval).toBe(1);
    });

    it("cardHistory() accumulates one entry per review, newest first", async () => {
      const card = await learning.addCard("front", "back");
      expect(learning.cardHistory(card.id)).toEqual([]);

      await learning.reviewCard(card.id, "good");
      await learning.reviewCard(card.id, "easy");

      const history = learning.cardHistory(card.id);
      expect(history).toHaveLength(2);
      expect(history[0].reviewCount).toBe(1);
      expect(history[1].reviewCount).toBe(0);
    });

    it("a card reviewed as 'good' is no longer due immediately after", async () => {
      const card = await learning.addCard("front", "back");
      await learning.reviewCard(card.id, "good");
      expect(learning.listCards({ due: true }).map((c) => c.id)).not.toContain(card.id);
    });

    it("repeated 'easy' reviews grow the interval", async () => {
      const card = await learning.addCard("front", "back");
      const r1 = await learning.reviewCard(card.id, "easy");
      const r2 = await learning.reviewCard(r1.id, "easy");
      const r3 = await learning.reviewCard(r2.id, "easy");
      expect(r2.interval).toBeGreaterThan(r1.interval);
      expect(r3.interval).toBeGreaterThan(r2.interval);
    });

    it("filters cards by tag", async () => {
      await learning.addCard("front1", "back1", { tags: ["spanish"] });
      await learning.addCard("front2", "back2", { tags: ["french"] });
      expect(learning.listCards({ tag: "spanish" })).toHaveLength(1);
    });

    it("emits learning:flashcard-added and learning:flashcard-reviewed events", async () => {
      const seen: string[] = [];
      eventBus.on("learning:flashcard-added", () => seen.push("added"));
      eventBus.on("learning:flashcard-reviewed", () => seen.push("reviewed"));

      const card = await learning.addCard("front", "back");
      await learning.reviewCard(card.id, "good");

      expect(seen).toEqual(["added", "reviewed"]);
    });

    it("does not create any knowledge graph nodes for flashcards", async () => {
      const card = await learning.addCard("front", "back");
      await learning.reviewCard(card.id, "good");
      expect(graph.stats().nodeCount).toBe(0);
    });
  });

  it("emits learning:resource-added and learning:resource-updated events", async () => {
    const seen: string[] = [];
    eventBus.on("learning:resource-added", () => seen.push("added"));
    eventBus.on("learning:resource-updated", () => seen.push("updated"));

    const resource = await learning.addResource("A course", "course");
    await learning.updateResourceStatus(resource.id, "completed");

    expect(seen).toEqual(["added", "updated"]);
  });
});
