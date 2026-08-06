export type SearchResultSource = "memory" | "graph" | "inbox" | "vault" | "workspace" | "learning";

/** One hit from `HybridSearch`, normalized across three otherwise-unrelated stores so a caller can render one ranked list. */
export interface SearchResult {
  source: SearchResultSource;
  id: string;
  title: string;
  snippet: string;
  tags: string[];
  createdAt: string;
  /** 0-1, deterministic heuristic relevance — not ML-ranked, same "transparent heuristic over an LLM/embedding call wherever one is good enough" convention as `codebase/indexer.ts`'s `searchIndex`. Semantic-mode hits (`semantic: true`) for every source except Graph are the exception, ranked by `MemoryManager.searchSemantic()`'s embedding cosine similarity instead — Graph has no embedding storage, so it stays keyword-scored even in semantic mode. */
  score: number;
}
