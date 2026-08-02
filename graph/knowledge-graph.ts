import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { KnowledgeEdge, KnowledgeEdgeKind, KnowledgeNode, KnowledgeNodeKind } from "./types";

interface GraphFile {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

export interface KnowledgeGraphOptions {
  /** Sub-directory under `.ashos/` to store this graph's file in, e.g. `"innovation"` -> `.ashos/innovation/graph.json`. Omit for the general-purpose, project-wide graph at `.ashos/graph.json`. */
  namespace?: string;
}

/**
 * A connected graph instead of isolated documents. Originally built as
 * Innovation Intelligence's "Unified Knowledge Graph" (still used that way
 * via `{ namespace: "innovation" }`, preserving its original
 * `.ashos/innovation/graph.json` location), this class is domain-agnostic
 * and also backs the General Knowledge Graph (no namespace ->
 * `.ashos/graph.json`) tracking projects/agents/tasks — see
 * `docs/knowledge-graph.md`. Persisted as a single JSON file, the same
 * local-first, no-external-DB pattern as MemoryManager/ExperimentStore.
 * Nodes are de-duplicated by (kind, label) so repeated observations of the
 * same company/repo/idea/project strengthen it instead of cloning it.
 */
export class KnowledgeGraph {
  constructor(
    private readonly root: string,
    private readonly options: KnowledgeGraphOptions = {}
  ) {}

  private file(): string {
    return this.options.namespace
      ? path.join(this.root, ".ashos", this.options.namespace, "graph.json")
      : path.join(this.root, ".ashos", "graph.json");
  }

  private read(): GraphFile {
    try {
      return JSON.parse(fs.readFileSync(this.file(), "utf-8")) as GraphFile;
    } catch {
      return { nodes: [], edges: [] };
    }
  }

  private write(data: GraphFile): void {
    fs.mkdirSync(path.dirname(this.file()), { recursive: true });
    fs.writeFileSync(this.file(), JSON.stringify(data, null, 2));
  }

  upsertNode(input: { kind: KnowledgeNodeKind; label: string; tags?: string[]; data?: Record<string, unknown> }): KnowledgeNode {
    const graph = this.read();
    const existing = graph.nodes.find((n) => n.kind === input.kind && n.label.toLowerCase() === input.label.toLowerCase());
    const now = new Date().toISOString();

    if (existing) {
      existing.tags = [...new Set([...existing.tags, ...(input.tags ?? [])])];
      existing.data = { ...existing.data, ...input.data };
      existing.updatedAt = now;
      this.write(graph);
      return existing;
    }

    const node: KnowledgeNode = {
      id: randomUUID(),
      kind: input.kind,
      label: input.label,
      tags: input.tags ?? [],
      data: input.data,
      createdAt: now,
      updatedAt: now
    };
    graph.nodes.push(node);
    this.write(graph);
    return node;
  }

  addEdge(from: string, to: string, kind: KnowledgeEdgeKind, weight = 1): KnowledgeEdge {
    const graph = this.read();
    const existing = graph.edges.find((e) => e.from === from && e.to === to && e.kind === kind);
    const now = new Date().toISOString();

    if (existing) {
      existing.weight += weight;
      existing.updatedAt = now;
      this.write(graph);
      return existing;
    }

    const edge: KnowledgeEdge = { id: randomUUID(), from, to, kind, weight, createdAt: now, updatedAt: now };
    graph.edges.push(edge);
    this.write(graph);
    return edge;
  }

  getNode(id: string): KnowledgeNode | undefined {
    return this.read().nodes.find((n) => n.id === id);
  }

  listNodes(filter?: { kind?: KnowledgeNodeKind; tag?: string }): KnowledgeNode[] {
    return this.read().nodes.filter((n) => {
      if (filter?.kind && n.kind !== filter.kind) return false;
      if (filter?.tag && !n.tags.includes(filter.tag)) return false;
      return true;
    });
  }

  listEdges(): KnowledgeEdge[] {
    return this.read().edges;
  }

  neighbors(nodeId: string): { node: KnowledgeNode; edge: KnowledgeEdge }[] {
    const graph = this.read();
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    return graph.edges
      .filter((e) => e.from === nodeId || e.to === nodeId)
      .map((edge) => {
        const otherId = edge.from === nodeId ? edge.to : edge.from;
        const node = byId.get(otherId);
        return node ? { node, edge } : undefined;
      })
      .filter((n): n is { node: KnowledgeNode; edge: KnowledgeEdge } => Boolean(n));
  }

  /** Breadth-first traversal up to `depth` hops, excluding the starting node itself. */
  related(nodeId: string, depth = 1): KnowledgeNode[] {
    const graph = this.read();
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const visited = new Set<string>([nodeId]);
    let frontier = [nodeId];

    for (let hop = 0; hop < depth; hop++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const edge of graph.edges) {
          const otherId = edge.from === id ? edge.to : edge.to === id ? edge.from : undefined;
          if (otherId && !visited.has(otherId)) {
            visited.add(otherId);
            next.push(otherId);
          }
        }
      }
      frontier = next;
    }

    visited.delete(nodeId);
    return [...visited].map((id) => byId.get(id)).filter((n): n is KnowledgeNode => Boolean(n));
  }

  stats(): { nodeCount: number; edgeCount: number; byKind: Record<string, number> } {
    const graph = this.read();
    const byKind: Record<string, number> = {};
    for (const node of graph.nodes) byKind[node.kind] = (byKind[node.kind] ?? 0) + 1;
    return { nodeCount: graph.nodes.length, edgeCount: graph.edges.length, byKind };
  }
}
