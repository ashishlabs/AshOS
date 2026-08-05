import type { MemoryManager } from "../memory/memory-manager";
import type { KnowledgeGraph } from "../graph/knowledge-graph";
import type { KnowledgeNode } from "../graph/types";
import type { InboxManager } from "../inbox/inbox-manager";
import type { InboxItem } from "../inbox/types";
import type { SearchResult } from "./types";

export interface HybridSearchOptions {
  /** Max results returned, after merging and ranking across all three stores. */
  limit?: number;
  /** Use `MemoryManager.searchSemantic()` (embedding cosine similarity, best-effort) for the Memory slice instead of plain keyword matching. Graph/Inbox matching is always keyword-based — neither store computes embeddings. */
  semantic?: boolean;
}

function textScore(haystacks: string[], query: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  let best: number | null = null;
  for (const raw of haystacks) {
    const h = raw.toLowerCase();
    let score: number | null = null;
    if (h === q) score = 1;
    else if (h.startsWith(q)) score = 0.75;
    else if (h.includes(q)) score = 0.5;
    if (score !== null && (best === null || score > best)) best = score;
  }
  return best;
}

/**
 * "Find everything about X" across the three stores a Second Brain
 * capture/connect flow actually populates — Memory, the general
 * Knowledge Graph, and the Inbox — without touching any of the three
 * (Second Brain roadmap Tier 2 item 6, `docs/second-brain-roadmap.md`).
 * Deliberately not a fourth search index: every slice queries its own
 * store's existing lookup (`MemoryManager.query`/`searchSemantic`,
 * `KnowledgeGraph.listNodes`, `InboxManager.list`) and this class only
 * merges and ranks the results. Graph/Inbox matching is a deterministic
 * substring heuristic (same "transparent heuristic over an LLM/embedding
 * call wherever one is good enough" convention as
 * `codebase/indexer.ts`'s `searchIndex`); Memory matching can opt into
 * the existing semantic vector search instead.
 */
export class HybridSearch {
  constructor(
    private readonly memory: MemoryManager,
    private readonly graph: KnowledgeGraph,
    private readonly inbox: InboxManager
  ) {}

  async search(query: string, options: HybridSearchOptions = {}): Promise<SearchResult[]> {
    const limit = options.limit ?? 20;
    const memoryHits = options.semantic ? await this.searchMemorySemantic(query, limit) : this.searchMemory(query);
    const results = [...memoryHits, ...this.searchGraph(query), ...this.searchInbox(query)];
    return results.sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  /** `InboxManager` persists items *as* Memory records (see `docs/inbox.md`) — excluded here so a matching Inbox item surfaces once, via `searchInbox()`'s friendlier title/snippet, not twice. */
  private isInboxBackedRecord(tags: string[] | undefined): boolean {
    return Boolean(tags?.includes("inbox"));
  }

  private searchMemory(query: string): SearchResult[] {
    return this.memory
      .query({ text: query })
      .filter((record) => !this.isInboxBackedRecord(record.tags))
      .map((record) => ({
        source: "memory" as const,
        id: record.id,
        title: record.key,
        snippet: JSON.stringify(record.value).slice(0, 200),
        tags: record.tags ?? [],
        createdAt: record.createdAt,
        score: textScore([record.key, ...(record.tags ?? [])], query) ?? 0.4
      }));
  }

  private async searchMemorySemantic(query: string, limit: number): Promise<SearchResult[]> {
    const records = (await this.memory.searchSemantic(query, limit)).filter((record) => !this.isInboxBackedRecord(record.tags));
    return records.map((record, index) => ({
      source: "memory",
      id: record.id,
      title: record.key,
      snippet: JSON.stringify(record.value).slice(0, 200),
      tags: record.tags ?? [],
      createdAt: record.createdAt,
      // searchSemantic() returns results already ranked by cosine similarity but doesn't expose the raw score, so rank position is converted into a comparable 0-1 value instead of pretending to know the exact similarity.
      score: Math.max(0, 1 - index / Math.max(records.length, 1))
    }));
  }

  private searchGraph(query: string): SearchResult[] {
    const hits: SearchResult[] = [];
    for (const node of this.graph.listNodes()) {
      const score = textScore([node.label, ...node.tags], query);
      if (score !== null) hits.push(this.graphHit(node, score));
    }
    return hits;
  }

  private graphHit(node: KnowledgeNode, score: number): SearchResult {
    return {
      source: "graph",
      id: node.id,
      title: node.label,
      snippet: `[${node.kind}]${node.tags.length ? ` ${node.tags.join(", ")}` : ""}`,
      tags: node.tags,
      createdAt: node.createdAt,
      score
    };
  }

  private searchInbox(query: string): SearchResult[] {
    const hits: SearchResult[] = [];
    for (const item of this.inbox.list()) {
      const score = textScore([item.content, ...item.tags], query);
      if (score !== null) hits.push(this.inboxHit(item, score));
    }
    return hits;
  }

  private inboxHit(item: InboxItem, score: number): SearchResult {
    return {
      source: "inbox",
      id: item.id,
      title: item.content.length > 80 ? `${item.content.slice(0, 77)}...` : item.content,
      snippet: `[${item.sourceType}/${item.status}]`,
      tags: item.tags,
      createdAt: item.createdAt,
      score
    };
  }
}
