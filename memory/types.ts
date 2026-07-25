export type MemoryScope = "short-term" | "session" | "project" | "global";

export interface MemoryRecord {
  id: string;
  scope: MemoryScope;
  key: string;
  value: unknown;
  tags?: string[];
  embedding?: number[];
  createdAt: string;
  expiresAt?: string;
}

export interface MemoryQuery {
  scope?: MemoryScope;
  tag?: string;
  text?: string;
}
