import { randomUUID } from "node:crypto";
import type { EventBus } from "../kernel/event-bus";
import type { MemoryManager } from "../memory/memory-manager";
import type { KnowledgeGraph } from "../graph/knowledge-graph";
import { GRADE_TO_QUALITY, sm2, type ReviewGrade } from "./srs";
import type { Flashcard, LearningResource, LearningResourceStatus, LearningResourceType } from "./types";

const RESOURCE_TAG = "learning-resource";
const CARD_TAG = "learning-flashcard";

const INITIAL_EASE_FACTOR = 2.5;

function resourceStatusTag(status: LearningResourceStatus): string {
  return `learning-resource-status:${status}`;
}
function resourceKey(id: string): string {
  return `learning-resource:${id}`;
}
function cardKey(id: string): string {
  return `learning-flashcard:${id}`;
}
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export interface LearningManagerOptions {
  eventBus?: EventBus;
  /** General-purpose Knowledge Graph — best-effort only, same convention as `InboxManager`/`VaultManager`/`WorkspaceManager`. */
  graph?: KnowledgeGraph;
}

/**
 * Learning Hub: tracked courses/books/videos/articles, plus flashcards
 * reviewed via the SuperMemo-2 spaced repetition algorithm (`srs.ts`) —
 * the one Second Brain pillar that's genuinely new domain logic, not a
 * recombination of an existing AshOS pattern (unlike Inbox/Vault/
 * Workspace, which all reuse the same capture-plus-graph shape).
 * Deliberately still has no persistence engine of its own, though:
 * resources and flashcards are `MemoryManager` project-scope records
 * tagged `"learning-resource"`/`"learning-flashcard"`. See
 * `docs/learning-hub.md`.
 */
export class LearningManager {
  constructor(
    private readonly memory: MemoryManager,
    private readonly options: LearningManagerOptions = {}
  ) {}

  // ---------------------------------------------------------------------
  // Resources
  // ---------------------------------------------------------------------

  async addResource(
    title: string,
    type: LearningResourceType,
    opts: { url?: string; notes?: string; tags?: string[] } = {}
  ): Promise<LearningResource> {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) throw new Error("resource title must not be empty");

    const now = new Date().toISOString();
    const resource: LearningResource = {
      id: randomUUID(),
      title: trimmedTitle,
      type,
      url: opts.url,
      notes: (opts.notes ?? "").trim(),
      status: "to-learn",
      tags: [...new Set(opts.tags ?? [])],
      createdAt: now,
      updatedAt: now
    };

    await this.persistResource(resource);
    this.options.eventBus?.emit("learning:resource-added", { id: resource.id, title: resource.title });
    this.enrichResourceGraph(resource);
    return resource;
  }

  getResource(id: string): LearningResource | undefined {
    return this.memory.recall("project", resourceKey(id))?.value as LearningResource | undefined;
  }

  listResources(filter: { status?: LearningResourceStatus; type?: LearningResourceType } = {}): LearningResource[] {
    const resources = this.memory
      .query({ scope: "project", tag: RESOURCE_TAG })
      .map((r) => r.value as LearningResource)
      .filter((r) => (!filter.status || r.status === filter.status) && (!filter.type || r.type === filter.type));
    return resources.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateResourceStatus(id: string, status: LearningResourceStatus): Promise<LearningResource> {
    const resource = this.getResource(id);
    if (!resource) throw new Error(`learning resource "${id}" not found`);
    resource.status = status;
    resource.updatedAt = new Date().toISOString();
    await this.persistResource(resource);
    this.options.eventBus?.emit("learning:resource-updated", { id, status });
    return resource;
  }

  // ---------------------------------------------------------------------
  // Flashcards
  // ---------------------------------------------------------------------

  async addCard(front: string, back: string, opts: { tags?: string[] } = {}): Promise<Flashcard> {
    const trimmedFront = front.trim();
    const trimmedBack = back.trim();
    if (!trimmedFront || !trimmedBack) throw new Error("flashcard front and back must not be empty");

    const now = new Date().toISOString();
    const card: Flashcard = {
      id: randomUUID(),
      front: trimmedFront,
      back: trimmedBack,
      tags: [...new Set(opts.tags ?? [])],
      interval: 0,
      easeFactor: INITIAL_EASE_FACTOR,
      repetitions: 0,
      dueDate: now, // due immediately for its first review
      reviewCount: 0,
      createdAt: now,
      updatedAt: now
    };

    await this.persistCard(card);
    this.options.eventBus?.emit("learning:flashcard-added", { id: card.id });
    return card;
  }

  getCard(id: string): Flashcard | undefined {
    return this.memory.recall("project", cardKey(id))?.value as Flashcard | undefined;
  }

  /** `due: true` filters to cards whose `dueDate` has passed — i.e. ready to review now. */
  listCards(filter: { due?: boolean; tag?: string } = {}): Flashcard[] {
    const now = new Date().toISOString();
    const cards = this.memory
      .query({ scope: "project", tag: CARD_TAG })
      .map((r) => r.value as Flashcard)
      .filter((c) => (!filter.due || c.dueDate <= now) && (!filter.tag || c.tags.includes(filter.tag)));
    return cards.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  /** Grades the card via SM-2 (`srs.ts`) and schedules its next review. */
  async reviewCard(id: string, grade: ReviewGrade): Promise<Flashcard> {
    const card = this.getCard(id);
    if (!card) throw new Error(`flashcard "${id}" not found`);

    const result = sm2({ interval: card.interval, easeFactor: card.easeFactor, repetitions: card.repetitions }, GRADE_TO_QUALITY[grade]);
    const now = new Date();
    card.interval = result.interval;
    card.easeFactor = result.easeFactor;
    card.repetitions = result.repetitions;
    card.dueDate = addDays(now, result.interval).toISOString();
    card.reviewCount += 1;
    card.lastReviewedAt = now.toISOString();
    card.updatedAt = now.toISOString();

    await this.persistCard(card);
    this.options.eventBus?.emit("learning:flashcard-reviewed", { id, grade, dueDate: card.dueDate });
    return card;
  }

  private async persistResource(resource: LearningResource): Promise<void> {
    await this.memory.remember("project", resourceKey(resource.id), resource, {
      tags: [RESOURCE_TAG, resourceStatusTag(resource.status), ...resource.tags]
    });
  }

  private async persistCard(card: Flashcard): Promise<void> {
    await this.memory.remember("project", cardKey(card.id), card, {
      tags: [CARD_TAG, ...card.tags]
    });
  }

  private enrichResourceGraph(resource: LearningResource): void {
    if (!this.options.graph) return;
    try {
      this.options.graph.upsertNode({
        kind: "learning-resource",
        label: resource.title,
        tags: [resource.type, ...resource.tags],
        data: { learningResourceId: resource.id, type: resource.type, status: resource.status }
      });
    } catch {
      // best-effort — never let graph enrichment fail resource creation
    }
  }
}
