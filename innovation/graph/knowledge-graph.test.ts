import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KnowledgeGraph } from "./knowledge-graph";

describe("KnowledgeGraph", () => {
  let root: string;
  let graph: KnowledgeGraph;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-kg-"));
    graph = new KnowledgeGraph(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("creates a node on first upsert and persists it to disk", () => {
    const node = graph.upsertNode({ kind: "repository", label: "ashos/ashos", tags: ["ai"] });
    expect(node.id).toBeTruthy();
    expect(graph.listNodes()).toHaveLength(1);
    expect(fs.existsSync(path.join(root, ".ashos", "innovation", "graph.json"))).toBe(true);
  });

  it("de-duplicates by (kind, label) case-insensitively and merges tags instead of cloning", () => {
    const first = graph.upsertNode({ kind: "company", label: "Acme Inc", tags: ["saas"] });
    const second = graph.upsertNode({ kind: "company", label: "acme inc", tags: ["ai"] });

    expect(second.id).toBe(first.id);
    expect(graph.listNodes()).toHaveLength(1);
    expect(graph.getNode(first.id)?.tags.sort()).toEqual(["ai", "saas"]);
  });

  it("adds an edge between two nodes and strengthens it on repeat observation", () => {
    const a = graph.upsertNode({ kind: "problem", label: "manual invoicing" });
    const b = graph.upsertNode({ kind: "idea", label: "invoicing automation tool" });

    graph.addEdge(a.id, b.id, "solves");
    const edge = graph.addEdge(a.id, b.id, "solves");

    expect(graph.listEdges()).toHaveLength(1);
    expect(edge.weight).toBe(2);
  });

  it("finds direct neighbors of a node", () => {
    const a = graph.upsertNode({ kind: "problem", label: "manual invoicing" });
    const b = graph.upsertNode({ kind: "idea", label: "invoicing automation tool" });
    graph.addEdge(a.id, b.id, "solves");

    const neighbors = graph.neighbors(a.id);
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].node.id).toBe(b.id);
  });

  it("filters listNodes by kind and tag", () => {
    graph.upsertNode({ kind: "repository", label: "repo-a", tags: ["ai"] });
    graph.upsertNode({ kind: "company", label: "company-a", tags: ["ai"] });

    expect(graph.listNodes({ kind: "repository" })).toHaveLength(1);
    expect(graph.listNodes({ tag: "ai" })).toHaveLength(2);
  });

  it("walks multi-hop relations via related()", () => {
    const a = graph.upsertNode({ kind: "problem", label: "p" });
    const b = graph.upsertNode({ kind: "idea", label: "i" });
    const c = graph.upsertNode({ kind: "technology", label: "t" });
    graph.addEdge(a.id, b.id, "solves");
    graph.addEdge(b.id, c.id, "relates-to");

    expect(graph.related(a.id, 1).map((n) => n.id)).toEqual([b.id]);
    expect(graph.related(a.id, 2).map((n) => n.id).sort()).toEqual([b.id, c.id].sort());
  });

  it("reports stats grouped by node kind", () => {
    graph.upsertNode({ kind: "repository", label: "repo-a" });
    graph.upsertNode({ kind: "repository", label: "repo-b" });
    graph.upsertNode({ kind: "company", label: "company-a" });

    const stats = graph.stats();
    expect(stats.nodeCount).toBe(3);
    expect(stats.byKind.repository).toBe(2);
    expect(stats.byKind.company).toBe(1);
  });
});
