import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Signal } from "../types";
import type { EventCategory, IntelligenceEvent } from "./types";
import { findDuplicate, mergeSignalIntoEvent, normalizeSignal } from "./normalizer";

/**
 * JSON-file-per-event persistence for the canonical `IntelligenceEvent`
 * layer — same local-first pattern as `OpportunityStore`/`ExperimentStore`.
 * `upsert()` is the one entry point callers need: it normalizes a raw
 * `Signal`, checks it against every stored event of the same category for a
 * near-duplicate (see `normalizer.ts`), and either merges into the existing
 * canonical event or creates a new one.
 */
export class EventStore {
  constructor(private readonly root: string) {}

  private dir(): string {
    return path.join(this.root, ".ashos", "innovation", "events");
  }

  private file(id: string): string {
    return path.join(this.dir(), `${id}.json`);
  }

  save(event: IntelligenceEvent): void {
    fs.mkdirSync(this.dir(), { recursive: true });
    fs.writeFileSync(this.file(event.id), JSON.stringify(event, null, 2));
  }

  get(id: string): IntelligenceEvent | undefined {
    try {
      return JSON.parse(fs.readFileSync(this.file(id), "utf-8")) as IntelligenceEvent;
    } catch {
      return undefined;
    }
  }

  /** All canonical events, most recently observed first. */
  list(): IntelligenceEvent[] {
    if (!fs.existsSync(this.dir())) return [];
    return fs
      .readdirSync(this.dir())
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(this.dir(), f), "utf-8")) as IntelligenceEvent)
      .sort((a, b) => b.lastObservedAt.localeCompare(a.lastObservedAt));
  }

  byCategory(category: EventCategory): IntelligenceEvent[] {
    return this.list().filter((e) => e.category === category);
  }

  /** Normalizes `signal`, merging it into an existing near-duplicate canonical event or creating a new one. Returns the event and whether it was newly created. */
  upsert(signal: Signal): { event: IntelligenceEvent; created: boolean } {
    const existing = findDuplicate(signal, this.list());
    if (existing) {
      const merged = mergeSignalIntoEvent(existing, signal);
      this.save(merged);
      return { event: merged, created: false };
    }
    const event = normalizeSignal(signal, randomUUID());
    this.save(event);
    return { event, created: true };
  }
}
