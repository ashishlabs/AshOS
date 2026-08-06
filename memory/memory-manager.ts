import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type { EventBus } from "../kernel/event-bus";
import type { AIProvider } from "../providers/types";
import { VectorStore } from "./vector-store";
import type { MemoryQuery, MemoryRecord, MemoryRevision, MemoryScope } from "./types";

// A static `import ... from "node:sqlite"` resolves cleanly under `tsc`/`tsx`,
// but Vite/Vitest 5.x's builtin-module allowlist predates `node:sqlite` and
// fails to resolve it — so the runtime value is pulled in via `require` (a
// plain function call Vite's static analysis doesn't try to resolve),
// while the type stays a normal, erased-at-compile-time `import type`.
const { DatabaseSync } = createRequire(__filename)("node:sqlite") as { DatabaseSync: typeof DatabaseSyncType };

interface ShortTermEntry {
  record: MemoryRecord;
  timer?: NodeJS.Timeout;
}

type PersistedScope = "project" | "global";

interface RecordRow {
  key: string;
  id: string;
  value: string;
  tags: string | null;
  embedding: string | null;
  created_at: string;
  expires_at: string | null;
}

interface RevisionRow {
  seq: number;
  id: string;
  key: string;
  value: string;
  tags: string | null;
  superseded_at: string;
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS records (
    key TEXT PRIMARY KEY,
    id TEXT NOT NULL,
    value TEXT NOT NULL,
    tags TEXT,
    embedding TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT
  );
  CREATE TABLE IF NOT EXISTS record_tags (
    key TEXT NOT NULL,
    tag TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_record_tags_tag ON record_tags(tag);
  CREATE INDEX IF NOT EXISTS idx_record_tags_key ON record_tags(key);
  CREATE TABLE IF NOT EXISTS revisions (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    tags TEXT,
    superseded_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_revisions_key ON revisions(key);
`;

function rowToRecord(row: RecordRow, scope: PersistedScope): MemoryRecord {
  return {
    id: row.id,
    scope,
    key: row.key,
    value: JSON.parse(row.value),
    tags: row.tags ? JSON.parse(row.tags) : undefined,
    embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
    createdAt: row.created_at,
    expiresAt: row.expires_at ?? undefined
  };
}

function rowToRevision(row: RevisionRow, scope: PersistedScope): MemoryRevision {
  return {
    id: row.id,
    scope,
    key: row.key,
    value: JSON.parse(row.value),
    tags: row.tags ? JSON.parse(row.tags) : undefined,
    supersededAt: row.superseded_at
  };
}

/**
 * Unifies AshOS's memory scopes:
 *  - short-term: in-process, optionally TTL'd, lost on restart
 *  - session:    in-process for the lifetime of the CLI/API process
 *  - project:    persisted to .ashos/memory/project.db (SQLite via node:sqlite)
 *  - global:     persisted to ~/.ashos/memory/global.db (shared across projects)
 * project/global each get their own on-disk SQLite database (records +
 * record_tags + revisions tables) instead of a whole-file JSON array, so a
 * `remember()` call is a single indexed write instead of a read-modify-write
 * of every record, and `query({ tag })` — the shape every subsystem's
 * `list()` actually uses — is an indexed join instead of a full scan. On
 * first open, if an older project.json/global.json (plus their
 * `*-revisions.json` sidecar) exists and the new `.db` file doesn't yet,
 * its contents are imported once so upgrading never loses captured data.
 * All scopes are additionally indexed in a VectorStore when an embedding is
 * supplied (or computable via a provider) for semantic recall; project/global
 * embeddings are rehydrated from the database on construction so semantic
 * search survives process restarts, not just the lifetime of one instance.
 */
export class MemoryManager {
  private shortTerm = new Map<string, ShortTermEntry>();
  private session = new Map<string, MemoryRecord>();
  private vectorStore = new VectorStore();

  private projectDb: DatabaseSyncType;
  private globalDb: DatabaseSyncType;

  constructor(
    private root: string,
    private opts: { eventBus?: EventBus; provider?: AIProvider; globalDir?: string } = {}
  ) {
    const globalDir = opts.globalDir ?? path.join(process.env.HOME ?? root, ".ashos");
    this.projectDb = this.openDb(
      path.join(root, ".ashos", "memory", "project.db"),
      path.join(root, ".ashos", "memory", "project.json"),
      path.join(root, ".ashos", "memory", "project-revisions.json")
    );
    this.globalDb = this.openDb(
      path.join(globalDir, "memory", "global.db"),
      path.join(globalDir, "memory", "global.json"),
      path.join(globalDir, "memory", "global-revisions.json")
    );

    for (const scope of ["project", "global"] as const) {
      for (const row of this.dbFor(scope).prepare("SELECT * FROM records WHERE embedding IS NOT NULL").all() as unknown as RecordRow[]) {
        const record = rowToRecord(row, scope);
        if (record.embedding) this.vectorStore.upsert({ id: record.id, vector: record.embedding, metadata: { scope, key: record.key } });
      }
    }
  }

  private openDb(dbFile: string, oldRecordsFile: string, oldRevisionsFile: string): DatabaseSyncType {
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    const isNew = !fs.existsSync(dbFile);
    const db = new DatabaseSync(dbFile);
    db.exec(SCHEMA_SQL);
    if (isNew) this.migrateFromJson(db, oldRecordsFile, oldRevisionsFile);
    return db;
  }

  /** One-time import of the pre-SQLite JSON store, so upgrading an existing `.ashos/` directory never loses captured data. No-ops (and doesn't touch the old files) when they don't exist. */
  private migrateFromJson(db: DatabaseSyncType, recordsFile: string, revisionsFile: string): void {
    let records: MemoryRecord[];
    try {
      records = JSON.parse(fs.readFileSync(recordsFile, "utf-8"));
    } catch {
      return;
    }
    const insertRecord = db.prepare(
      "INSERT OR REPLACE INTO records (key, id, value, tags, embedding, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    const insertTag = db.prepare("INSERT INTO record_tags (key, tag) VALUES (?, ?)");
    for (const r of records) {
      insertRecord.run(
        r.key,
        r.id,
        JSON.stringify(r.value),
        r.tags ? JSON.stringify(r.tags) : null,
        r.embedding ? JSON.stringify(r.embedding) : null,
        r.createdAt,
        r.expiresAt ?? null
      );
      for (const tag of r.tags ?? []) insertTag.run(r.key, tag);
    }

    let revisions: MemoryRevision[];
    try {
      revisions = JSON.parse(fs.readFileSync(revisionsFile, "utf-8"));
    } catch {
      return;
    }
    const insertRevision = db.prepare("INSERT INTO revisions (id, key, value, tags, superseded_at) VALUES (?, ?, ?, ?, ?)");
    for (const rev of revisions) {
      insertRevision.run(rev.id, rev.key, JSON.stringify(rev.value), rev.tags ? JSON.stringify(rev.tags) : null, rev.supersededAt);
    }
  }

  private dbFor(scope: PersistedScope): DatabaseSyncType {
    return scope === "project" ? this.projectDb : this.globalDb;
  }

  async remember(scope: MemoryScope, key: string, value: unknown, opts: { tags?: string[]; ttlMs?: number } = {}): Promise<MemoryRecord> {
    const record: MemoryRecord = {
      id: randomUUID(),
      scope,
      key,
      value,
      tags: opts.tags,
      createdAt: new Date().toISOString(),
      expiresAt: opts.ttlMs ? new Date(Date.now() + opts.ttlMs).toISOString() : undefined
    };

    if (this.opts.provider) {
      try {
        record.embedding = await this.opts.provider.embeddings(`${key} ${JSON.stringify(value)}`);
      } catch {
        // embeddings are best-effort; recall still works via key/tag lookup
      }
    }

    if (scope === "short-term") {
      const timer = opts.ttlMs ? setTimeout(() => this.shortTerm.delete(key), opts.ttlMs) : undefined;
      this.shortTerm.set(key, { record, timer });
    } else if (scope === "session") {
      this.session.set(key, record);
    } else {
      const db = this.dbFor(scope);
      const existing = db.prepare("SELECT * FROM records WHERE key = ?").get(key) as RecordRow | undefined;
      if (existing) {
        db.prepare("INSERT INTO revisions (id, key, value, tags, superseded_at) VALUES (?, ?, ?, ?, ?)").run(
          randomUUID(),
          key,
          existing.value,
          existing.tags,
          record.createdAt
        );
      }
      db.prepare(
        `INSERT INTO records (key, id, value, tags, embedding, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET id=excluded.id, value=excluded.value, tags=excluded.tags, embedding=excluded.embedding, created_at=excluded.created_at, expires_at=excluded.expires_at`
      ).run(
        key,
        record.id,
        JSON.stringify(value),
        record.tags ? JSON.stringify(record.tags) : null,
        record.embedding ? JSON.stringify(record.embedding) : null,
        record.createdAt,
        record.expiresAt ?? null
      );
      db.prepare("DELETE FROM record_tags WHERE key = ?").run(key);
      if (record.tags?.length) {
        const insertTag = db.prepare("INSERT INTO record_tags (key, tag) VALUES (?, ?)");
        for (const tag of record.tags) insertTag.run(key, tag);
      }
    }

    if (record.embedding) this.vectorStore.upsert({ id: record.id, vector: record.embedding, metadata: { scope, key } });
    this.opts.eventBus?.emit("memory:updated", { scope, key });
    return record;
  }

  recall(scope: MemoryScope, key: string): MemoryRecord | undefined {
    if (scope === "short-term") return this.shortTerm.get(key)?.record;
    if (scope === "session") return this.session.get(key);
    const row = this.dbFor(scope).prepare("SELECT * FROM records WHERE key = ?").get(key) as RecordRow | undefined;
    return row ? rowToRecord(row, scope) : undefined;
  }

  query(query: MemoryQuery): MemoryRecord[] {
    const all = this.allRecords(query.scope, { tag: query.tag });
    return all.filter((r) => {
      if (query.tag && !r.tags?.includes(query.tag)) return false;
      if (query.text && !JSON.stringify(r.value).toLowerCase().includes(query.text.toLowerCase())) return false;
      return true;
    });
  }

  /** For `{ tag }`, joins through the indexed `record_tags` table instead of scanning every record — the shape every subsystem's `list()` (Inbox/Vault/Workspace/Learning) actually calls. */
  private queryPersisted(scope: PersistedScope, opts: { tag?: string }): MemoryRecord[] {
    const db = this.dbFor(scope);
    const rows = opts.tag
      ? (db.prepare("SELECT DISTINCT r.* FROM records r JOIN record_tags t ON r.key = t.key WHERE t.tag = ?").all(opts.tag) as unknown as RecordRow[])
      : (db.prepare("SELECT * FROM records").all() as unknown as RecordRow[]);
    return rows.map((row) => rowToRecord(row, scope));
  }

  private allRecords(scope?: MemoryScope, opts: { tag?: string } = {}): MemoryRecord[] {
    if (scope === "short-term") return [...this.shortTerm.values()].map((e) => e.record);
    if (scope === "session") return [...this.session.values()];
    if (scope === "project") return this.queryPersisted("project", opts);
    if (scope === "global") return this.queryPersisted("global", opts);
    return [
      ...[...this.shortTerm.values()].map((e) => e.record),
      ...this.session.values(),
      ...this.queryPersisted("project", opts),
      ...this.queryPersisted("global", opts)
    ];
  }

  async searchSemantic(text: string, topK = 5): Promise<MemoryRecord[]> {
    if (!this.opts.provider) return this.query({ text }).slice(0, topK);
    const vector = await this.opts.provider.embeddings(text);
    const hits = this.vectorStore.search(vector, topK);
    const all = this.allRecords();
    return hits.map((h) => all.find((r) => r.id === h.id)).filter((r): r is MemoryRecord => Boolean(r));
  }

  /**
   * Every prior value a project/global record held before being overwritten
   * by a newer `remember()` call with the same scope+key, newest first —
   * "what did this used to say." Inbox/Vault/Workspace/Learning records are
   * themselves Memory records (see `HybridSearch.isSubsystemBackedRecord`),
   * so this works for all of them with no changes to those managers; only
   * `short-term`/`session` are excluded, since those scopes were never
   * persisted in the first place.
   */
  revisions(scope: PersistedScope, key: string): MemoryRevision[] {
    // ORDER BY the autoincrementing seq (not supersededAt) gives newest-first even when two writes land in the same millisecond.
    const rows = this.dbFor(scope).prepare("SELECT * FROM revisions WHERE key = ? ORDER BY seq DESC").all(key) as unknown as RevisionRow[];
    return rows.map((row) => rowToRevision(row, scope));
  }

  forget(scope: MemoryScope, key: string): void {
    if (scope === "short-term") {
      const entry = this.shortTerm.get(key);
      if (entry?.timer) clearTimeout(entry.timer);
      this.shortTerm.delete(key);
      return;
    }
    if (scope === "session") {
      this.session.delete(key);
      return;
    }
    const db = this.dbFor(scope);
    db.prepare("DELETE FROM records WHERE key = ?").run(key);
    db.prepare("DELETE FROM record_tags WHERE key = ?").run(key);
    db.prepare("DELETE FROM revisions WHERE key = ?").run(key);
  }
}
