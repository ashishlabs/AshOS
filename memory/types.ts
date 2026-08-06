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

/** A record's value just before it was overwritten by a newer `remember()` call with the same scope+key — see `MemoryManager.revisions()`. Only persisted scopes (`project`/`global`) track revisions; `short-term`/`session` are ephemeral and gone on process exit regardless. */
export interface MemoryRevision {
  id: string;
  scope: "project" | "global";
  key: string;
  value: unknown;
  tags?: string[];
  /** When this snapshot was superseded by a newer `remember()` call — not when the value itself was originally created. */
  supersededAt: string;
}
