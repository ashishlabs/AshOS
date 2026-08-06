export type SearchResultSource = "memory" | "graph" | "inbox" | "vault" | "workspace";

/** One hit from `HybridSearch`, normalized across three otherwise-unrelated stores so a caller can render one ranked list. */
export interface SearchResult {
  source: SearchResultSource;
  id: string;
  title: string;
  snippet: string;
  tags: string[];
  createdAt: string;
  /** 0-1, deterministic heuristic relevance — not ML-ranked, same "transparent heuristic over an LLM/embedding call wherever one is good enough" convention as `codebase/indexer.ts`'s `searchIndex`. Semantic memory hits (`semantic: true`) are the one exception, ranked by `MemoryManager.searchSemantic()`'s cosine similarity instead. */
  score: number;
}
