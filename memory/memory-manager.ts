import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { EventBus } from "../kernel/event-bus";
import type { AIProvider } from "../providers/types";
import { VectorStore } from "./vector-store";
import type { MemoryQuery, MemoryRecord, MemoryScope } from "./types";

interface ShortTermEntry {
  record: MemoryRecord;
  timer?: NodeJS.Timeout;
}

/**
 * Unifies AshOS's memory scopes:
 *  - short-term: in-process, optionally TTL'd, lost on restart
 *  - session:    in-process for the lifetime of the CLI/API process
 *  - project:    persisted to .ashos/memory/project.json
 *  - global:     persisted to ~/.ashos/memory/global.json (shared across projects)
 * All scopes are additionally indexed in a VectorStore when an embedding is
 * supplied (or computable via a provider) for semantic recall.
 */
export class MemoryManager {
  private shortTerm = new Map<string, ShortTermEntry>();
  private session = new Map<string, MemoryRecord>();
  private vectorStore = new VectorStore();

  private projectFile: string;
  private globalFile: string;

  constructor(
    private root: string,
    private opts: { eventBus?: EventBus; provider?: AIProvider; globalDir?: string } = {}
  ) {
    this.projectFile = path.join(root, ".ashos", "memory", "project.json");
    this.globalFile = path.join(opts.globalDir ?? path.join(process.env.HOME ?? root, ".ashos"), "memory", "global.json");
  }

  private readFile(file: string): MemoryRecord[] {
    try {
      return JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch {
      return [];
    }
  }

  private writeFile(file: string, records: MemoryRecord[]): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(records, null, 2));
  }

  private fileFor(scope: "project" | "global"): string {
    return scope === "project" ? this.projectFile : this.globalFile;
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
      const file = this.fileFor(scope);
      const records = this.readFile(file).filter((r) => r.key !== key);
      records.push(record);
      this.writeFile(file, records);
    }

    if (record.embedding) this.vectorStore.upsert({ id: record.id, vector: record.embedding, metadata: { scope, key } });
    this.opts.eventBus?.emit("memory:updated", { scope, key });
    return record;
  }

  recall(scope: MemoryScope, key: string): MemoryRecord | undefined {
    if (scope === "short-term") return this.shortTerm.get(key)?.record;
    if (scope === "session") return this.session.get(key);
    return this.readFile(this.fileFor(scope)).find((r) => r.key === key);
  }

  query(query: MemoryQuery): MemoryRecord[] {
    const all = this.allRecords(query.scope);
    return all.filter((r) => {
      if (query.tag && !r.tags?.includes(query.tag)) return false;
      if (query.text && !JSON.stringify(r.value).toLowerCase().includes(query.text.toLowerCase())) return false;
      return true;
    });
  }

  private allRecords(scope?: MemoryScope): MemoryRecord[] {
    if (scope === "short-term") return [...this.shortTerm.values()].map((e) => e.record);
    if (scope === "session") return [...this.session.values()];
    if (scope === "project") return this.readFile(this.projectFile);
    if (scope === "global") return this.readFile(this.globalFile);
    return [
      ...[...this.shortTerm.values()].map((e) => e.record),
      ...this.session.values(),
      ...this.readFile(this.projectFile),
      ...this.readFile(this.globalFile)
    ];
  }

  async searchSemantic(text: string, topK = 5): Promise<MemoryRecord[]> {
    if (!this.opts.provider) return this.query({ text }).slice(0, topK);
    const vector = await this.opts.provider.embeddings(text);
    const hits = this.vectorStore.search(vector, topK);
    const all = this.allRecords();
    return hits.map((h) => all.find((r) => r.id === h.id)).filter((r): r is MemoryRecord => Boolean(r));
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
    const file = this.fileFor(scope);
    this.writeFile(file, this.readFile(file).filter((r) => r.key !== key));
  }
}
