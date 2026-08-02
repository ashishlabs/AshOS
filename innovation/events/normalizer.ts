import type { Signal, SignalKind } from "../types";
import type { EventCategory, EventSource, IntelligenceEvent } from "./types";

/**
 * Default `SignalKind` -> `EventCategory` mapping. Deliberately a plain
 * lookup table (not logic) so it's trivial to extend when a new
 * `SignalKind` is added. A signal's tags are checked first (see
 * `categorize`) since they're often more specific than the collector's
 * generic kind — e.g. a "repository" signal tagged "framework" should
 * classify as `framework`, not the catch-all `repository`.
 */
const KIND_TO_CATEGORY: Record<SignalKind, EventCategory> = {
  startup: "startup",
  funding: "funding",
  "product-launch": "developer-tool",
  acquisition: "acquisition",
  repository: "repository",
  issue: "developer-tool",
  "feature-request": "developer-tool",
  complaint: "developer-tool",
  question: "developer-tool",
  discussion: "developer-tool",
  paper: "research-paper",
  "model-release": "model-release",
  benchmark: "benchmark",
  "workflow-friction": "developer-tool",
  "competitor-change": "pricing-update"
};

/** Tags that, when present, override the kind-based category — a signal's own vocabulary is often more precise than its collector's generic kind. */
const TAG_CATEGORY_OVERRIDES: Partial<Record<string, EventCategory>> = {
  framework: "framework",
  dataset: "dataset",
  "open-weight": "model-release",
  "breaking-change": "breaking-change",
  security: "security-issue",
  pricing: "pricing-update",
  "api-change": "api-change",
  library: "library-update"
};

export function categorize(signal: Signal): EventCategory {
  for (const tag of signal.tags) {
    const override = TAG_CATEGORY_OVERRIDES[tag.toLowerCase()];
    if (override) return override;
  }
  return KIND_TO_CATEGORY[signal.kind] ?? "developer-tool";
}

function normalizedTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function titleTokens(title: string): Set<string> {
  return new Set(normalizedTitle(title).split(" ").filter((w) => w.length > 2));
}

/** Jaccard similarity over title tokens ∪ tags — cheap, dependency-free, good enough to catch near-duplicate reports of the same real-world event. */
export function similarity(a: { title: string; tags: string[] }, b: { title: string; tags: string[] }): number {
  const aSet = new Set([...titleTokens(a.title), ...a.tags.map((t) => t.toLowerCase())]);
  const bSet = new Set([...titleTokens(b.title), ...b.tags.map((t) => t.toLowerCase())]);
  if (aSet.size === 0 || bSet.size === 0) return 0;
  const intersection = [...aSet].filter((x) => bSet.has(x)).length;
  const union = new Set([...aSet, ...bSet]).size;
  return intersection / union;
}

/** Above this Jaccard similarity, two same-category signals are treated as reports of the same underlying event. */
export const DEDUP_THRESHOLD = 0.5;

export function toEventSource(signal: Signal): EventSource {
  return { source: signal.source, domain: signal.domain, url: signal.url, observedAt: signal.observedAt, confidence: signal.confidence };
}

/** Fresh canonical event from a single signal — the seed a later signal may merge into. */
export function normalizeSignal(signal: Signal, id: string): IntelligenceEvent {
  const source = toEventSource(signal);
  return {
    id,
    category: categorize(signal),
    title: signal.title,
    summary: signal.summary,
    tags: [...signal.tags],
    domains: [signal.domain],
    sources: [source],
    confidence: signal.confidence,
    firstObservedAt: signal.observedAt,
    lastObservedAt: signal.observedAt,
    occurrences: 1
  };
}

/**
 * Merges a new signal into an existing canonical event, preserving every
 * source rather than overwriting. Confidence combines optimistically
 * (independent corroborating sources should raise confidence, not average
 * it down) using `1 - Π(1 - cᵢ)`, capped at 0.99 so it never claims
 * certainty.
 */
export function mergeSignalIntoEvent(event: IntelligenceEvent, signal: Signal): IntelligenceEvent {
  const source = toEventSource(signal);
  const combinedConfidence = Math.min(0.99, 1 - (1 - event.confidence) * (1 - signal.confidence));
  return {
    ...event,
    tags: [...new Set([...event.tags, ...signal.tags])],
    domains: [...new Set([...event.domains, signal.domain])],
    sources: [...event.sources, source],
    confidence: combinedConfidence,
    firstObservedAt: signal.observedAt < event.firstObservedAt ? signal.observedAt : event.firstObservedAt,
    lastObservedAt: signal.observedAt > event.lastObservedAt ? signal.observedAt : event.lastObservedAt,
    occurrences: event.occurrences + 1
  };
}

/** Finds the best same-category match for a signal among existing events, if any is above `DEDUP_THRESHOLD`. */
export function findDuplicate(signal: Signal, events: IntelligenceEvent[]): IntelligenceEvent | undefined {
  const category = categorize(signal);
  let best: IntelligenceEvent | undefined;
  let bestScore = 0;
  for (const event of events) {
    if (event.category !== category) continue;
    const score = similarity({ title: signal.title, tags: signal.tags }, { title: event.title, tags: event.tags });
    if (score > bestScore) {
      bestScore = score;
      best = event;
    }
  }
  return bestScore >= DEDUP_THRESHOLD ? best : undefined;
}
