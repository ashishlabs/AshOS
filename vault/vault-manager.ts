import { randomUUID } from "node:crypto";
import type { EventBus } from "../kernel/event-bus";
import type { MemoryManager } from "../memory/memory-manager";
import type { KnowledgeGraph } from "../graph/knowledge-graph";
import { InboxManager } from "../inbox/inbox-manager";
import type { VaultNote, VaultStatus } from "./types";

const TAG = "vault";

function statusTag(status: VaultStatus): string {
  return `vault-status:${status}`;
}

function key(id: string): string {
  return `vault:${id}`;
}

export interface VaultManagerOptions {
  eventBus?: EventBus;
  /** General-purpose Knowledge Graph — best-effort only, same convention as `InboxManager`. */
  graph?: KnowledgeGraph;
}

/**
 * Knowledge Vault: curated, long-form notes with links between them — the
 * "second brain" layer above the Inbox's raw capture
 * (`docs/second-brain-roadmap.md` Tier 3 item 7). Deliberately has no
 * persistence engine of its own — notes are `MemoryManager` project-scope
 * records tagged `"vault"`, the same reuse convention `InboxManager`
 * established. A note's title is immutable once created (it doubles as
 * the Knowledge Graph node's dedup key, see `enrichGraph`) — content,
 * tags, and links can still change after creation. See
 * `docs/knowledge-vault.md`.
 */
export class VaultManager {
  constructor(
    private readonly memory: MemoryManager,
    private readonly options: VaultManagerOptions = {}
  ) {}

  async create(
    title: string,
    content: string,
    opts: { tags?: string[]; links?: string[]; sourceInboxId?: string } = {}
  ): Promise<VaultNote> {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) throw new Error("vault note title must not be empty");

    const now = new Date().toISOString();
    const note: VaultNote = {
      id: randomUUID(),
      title: trimmedTitle,
      content: content.trim(),
      tags: [...new Set(opts.tags ?? [])],
      links: [...new Set(opts.links ?? [])],
      status: "active",
      createdAt: now,
      updatedAt: now,
      sourceInboxId: opts.sourceInboxId
    };

    await this.persist(note);
    this.options.eventBus?.emit("vault:created", { id: note.id, title: note.title });
    this.enrichGraph(note);
    return note;
  }

  /** Promotes an existing Inbox item into a Vault note, carrying its content/tags forward and marking the source item "reviewed" — same "Promote to X" pattern as `IdeaAgent`. */
  async promoteFromInbox(inboxId: string, opts: { title?: string } = {}): Promise<VaultNote> {
    const inbox = new InboxManager(this.memory);
    const item = inbox.get(inboxId);
    if (!item) throw new Error(`inbox item "${inboxId}" not found`);

    const title = opts.title?.trim() || (item.content.length > 60 ? `${item.content.slice(0, 57)}...` : item.content);
    const note = await this.create(title, item.content, { tags: item.tags, sourceInboxId: item.id });
    await inbox.updateStatus(item.id, "reviewed");
    return note;
  }

  get(id: string): VaultNote | undefined {
    return this.memory.recall("project", key(id))?.value as VaultNote | undefined;
  }

  list(filter: { status?: VaultStatus; tag?: string } = {}): VaultNote[] {
    const notes = this.memory
      .query({ scope: "project", tag: TAG })
      .map((r) => r.value as VaultNote)
      .filter((note) => (!filter.status || note.status === filter.status) && (!filter.tag || note.tags.includes(filter.tag)));
    return notes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async archive(id: string): Promise<VaultNote> {
    const note = this.get(id);
    if (!note) throw new Error(`vault note "${id}" not found`);
    note.status = "archived";
    note.updatedAt = new Date().toISOString();
    await this.persist(note);
    this.options.eventBus?.emit("vault:updated", { id, status: note.status });
    return note;
  }

  /** Links `id` to `targetId` and best-effort records a `relates-to` edge between their graph nodes. Idempotent — linking the same pair twice is a no-op the second time. */
  async link(id: string, targetId: string): Promise<VaultNote> {
    const note = this.get(id);
    if (!note) throw new Error(`vault note "${id}" not found`);
    if (!this.get(targetId)) throw new Error(`vault note "${targetId}" not found`);

    if (!note.links.includes(targetId)) {
      note.links = [...note.links, targetId];
      note.updatedAt = new Date().toISOString();
      await this.persist(note);
    }
    this.options.eventBus?.emit("vault:linked", { id, targetId });
    this.enrichLink(id, targetId);
    return note;
  }

  /** Notes that link to `id` — the inverse of `note.links`. */
  backlinks(id: string): VaultNote[] {
    return this.list().filter((note) => note.links.includes(id));
  }

  /** Every prior version of this note, newest first — "what did this note used to say." Free via `MemoryManager.revisions()`, since every note is already a project-scope Memory record; no separate version-chain storage needed. */
  history(id: string): VaultNote[] {
    return this.memory.revisions("project", key(id)).map((r) => r.value as VaultNote);
  }

  private async persist(note: VaultNote): Promise<void> {
    await this.memory.remember("project", key(note.id), note, {
      tags: [TAG, statusTag(note.status), ...note.tags]
    });
  }

  private enrichGraph(note: VaultNote): void {
    if (!this.options.graph) return;
    try {
      const node = this.options.graph.upsertNode({
        kind: "note",
        label: note.title,
        tags: note.tags,
        data: { vaultId: note.id, sourceInboxId: note.sourceInboxId }
      });
      if (note.sourceInboxId) {
        const resourceNode = this.options.graph
          .listNodes({ kind: "resource" })
          .find((n) => n.data?.inboxId === note.sourceInboxId);
        if (resourceNode) this.options.graph.addEdge(node.id, resourceNode.id, "relates-to");
      }
    } catch {
      // best-effort — never let graph enrichment fail note creation
    }
  }

  private enrichLink(fromId: string, toId: string): void {
    if (!this.options.graph) return;
    try {
      const fromNote = this.get(fromId);
      const toNote = this.get(toId);
      if (!fromNote || !toNote) return;
      const fromNode = this.options.graph.upsertNode({ kind: "note", label: fromNote.title });
      const toNode = this.options.graph.upsertNode({ kind: "note", label: toNote.title });
      this.options.graph.addEdge(fromNode.id, toNode.id, "relates-to");
    } catch {
      // best-effort — never let graph enrichment fail linking
    }
  }
}
