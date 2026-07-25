export interface VectorEntry {
  id: string;
  vector: number[];
  metadata?: Record<string, unknown>;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * In-memory vector index using brute-force cosine similarity. Good enough
 * for a single project's memory (thousands, not millions, of entries);
 * swap for a real vector DB via a plugin when scale demands it.
 */
export class VectorStore {
  private entries: VectorEntry[] = [];

  upsert(entry: VectorEntry): void {
    const idx = this.entries.findIndex((e) => e.id === entry.id);
    if (idx >= 0) this.entries[idx] = entry;
    else this.entries.push(entry);
  }

  remove(id: string): void {
    this.entries = this.entries.filter((e) => e.id !== id);
  }

  search(vector: number[], topK = 5): (VectorEntry & { score: number })[] {
    return this.entries
      .map((e) => ({ ...e, score: cosineSimilarity(vector, e.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  size(): number {
    return this.entries.length;
  }
}
