import { randomUUID } from "node:crypto";
import type { EventBus } from "../kernel/event-bus";
import type { MemoryManager } from "../memory/memory-manager";
import type { KnowledgeGraph } from "../graph/knowledge-graph";
import type { AIProvider } from "../providers/types";
import type { WebFetchTool } from "../tools/web-fetch-tool";
import { classify } from "./classifier";
import type { InboxItem, InboxSourceType, InboxStatus } from "./types";

const TAG = "inbox";

const SUMMARY_SYSTEM_PROMPT =
  "You are AshOS's Inbox summarizer. In one short sentence (under 20 words), describe what this captured item is about so it's recognizable at a glance later. No preamble, no quotes, just the sentence.";

function statusTag(status: InboxStatus): string {
  return `inbox-status:${status}`;
}

function key(id: string): string {
  return `inbox:${id}`;
}

export interface InboxManagerOptions {
  eventBus?: EventBus;
  /** General-purpose Knowledge Graph — best-effort only, capture never fails because of it (same convention as `CodebaseAnalystAgent.enrichProjectNode`). */
  graph?: KnowledgeGraph;
  /** When present, `capture()` best-effort asks this provider for a one-sentence summary of the captured text and stores it as `InboxItem.summary`. Absent provider or a failed call never blocks capture. */
  provider?: AIProvider;
  /** When present alongside `provider` and the captured content contains a URL, `capture()` best-effort fetches the page's readable text (see `tools/web-fetch-tool.ts`'s safety limits) and folds it into the summarization prompt, so the summary reflects what the link is actually about instead of just its URL string. A failed/blocked/timed-out fetch falls back to summarizing the pasted text alone — never blocks or fails capture. */
  webFetch?: WebFetchTool;
}

/**
 * Universal Inbox: the single capture point everything enters AshOS
 * through (`docs/second-brain-roadmap.md`). Deliberately has no
 * persistence engine of its own — items are `MemoryManager` project-scope
 * records tagged `"inbox"`, reusing the existing JSON-file store, tag
 * query, and (best-effort) semantic embedding instead of duplicating a
 * new one. See `docs/inbox.md`.
 */
export class InboxManager {
  constructor(
    private readonly memory: MemoryManager,
    private readonly options: InboxManagerOptions = {}
  ) {}

  async capture(content: string, opts: { sourceType?: InboxSourceType; tags?: string[] } = {}): Promise<InboxItem> {
    const trimmed = content.trim();
    if (!trimmed) throw new Error("inbox content must not be empty");

    const classification = classify(trimmed);
    const now = new Date().toISOString();
    const item: InboxItem = {
      id: randomUUID(),
      content: trimmed,
      sourceType: opts.sourceType ?? classification.sourceType,
      status: "unread",
      tags: [...new Set([...(opts.tags ?? []), ...classification.tags])],
      createdAt: now,
      updatedAt: now,
      detectedUrl: classification.detectedUrl,
      summary: await this.summarize(trimmed, classification.detectedUrl)
    };

    await this.persist(item);
    this.options.eventBus?.emit("inbox:captured", { id: item.id, sourceType: item.sourceType });
    this.enrichGraph(item);
    return item;
  }

  get(id: string): InboxItem | undefined {
    return this.memory.recall("project", key(id))?.value as InboxItem | undefined;
  }

  list(filter: { status?: InboxStatus } = {}): InboxItem[] {
    const items = this.memory
      .query({ scope: "project", tag: TAG })
      .map((r) => r.value as InboxItem)
      .filter((item) => !filter.status || item.status === filter.status);
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateStatus(id: string, status: InboxStatus): Promise<InboxItem> {
    const item = this.get(id);
    if (!item) throw new Error(`inbox item "${id}" not found`);
    item.status = status;
    item.updatedAt = new Date().toISOString();
    await this.persist(item);
    this.options.eventBus?.emit("inbox:updated", { id, status });
    return item;
  }

  archive(id: string): Promise<InboxItem> {
    return this.updateStatus(id, "archived");
  }

  /** Best-effort — never let a slow/unreachable/misconfigured provider (or fetch) block capture. */
  private async summarize(content: string, detectedUrl?: string): Promise<string | undefined> {
    if (!this.options.provider) return undefined;
    try {
      const fetched = detectedUrl ? await this.fetchUrlContext(detectedUrl) : undefined;
      const userContent = fetched ? `${content}\n\n[Fetched page content]\n${fetched}` : content;
      const { content: summary } = await this.options.provider.chat(
        [
          { role: "system", content: SUMMARY_SYSTEM_PROMPT },
          { role: "user", content: userContent }
        ],
        { temperature: 0.3 }
      );
      return summary.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  /** Best-effort only — a blocked/timed-out/failed fetch just means the summary falls back to the pasted text alone. */
  private async fetchUrlContext(url: string): Promise<string | undefined> {
    if (!this.options.webFetch) return undefined;
    try {
      const result = await this.options.webFetch.execute({ action: "fetch", args: { url } });
      return result.ok ? result.output : undefined;
    } catch {
      return undefined;
    }
  }

  private async persist(item: InboxItem): Promise<void> {
    await this.memory.remember("project", key(item.id), item, {
      tags: [TAG, statusTag(item.status), item.sourceType, ...item.tags]
    });
  }

  private enrichGraph(item: InboxItem): void {
    if (!this.options.graph) return;
    try {
      const node = this.options.graph.upsertNode({
        kind: "resource",
        label: item.content.length > 80 ? `${item.content.slice(0, 77)}...` : item.content,
        tags: [item.sourceType, ...item.tags],
        data: { inboxId: item.id, detectedUrl: item.detectedUrl }
      });
      if (item.sourceType === "github-repo" && item.detectedUrl) {
        const repoLabel = item.detectedUrl.replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\/$/, "");
        const repoNode = this.options.graph.upsertNode({ kind: "repository", label: repoLabel, tags: ["inbox"] });
        this.options.graph.addEdge(node.id, repoNode.id, "relates-to");
      }
    } catch {
      // best-effort — never let graph enrichment fail capture
    }
  }
}
