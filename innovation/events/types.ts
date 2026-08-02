import type { IntelligenceDomain } from "../../kernel/config";
import type { Signal, SignalKind } from "../types";

/**
 * Unified taxonomy every normalized event is classified into, regardless of
 * which collector/domain produced the underlying signal(s). Deliberately a
 * flat, closed set (not `SignalKind`, which is collector-facing and keeps
 * growing) so downstream consumers (Technology Radar, reports, dashboard
 * filters) have a stable, small vocabulary to reason over.
 */
export const EVENT_CATEGORIES = [
  "model-release",
  "repository",
  "framework",
  "benchmark",
  "research-paper",
  "startup",
  "funding",
  "acquisition",
  "api-change",
  "pricing-update",
  "security-issue",
  "breaking-change",
  "dataset",
  "developer-tool",
  "library-update"
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/** One occurrence of a canonical event as reported by a single collector/source, kept for evidence even after merging. */
export interface EventSource {
  source: string;
  domain: IntelligenceDomain;
  url?: string;
  observedAt: string;
  confidence: number;
}

/**
 * A canonical, deduplicated event — the "Event Normalization" stage between
 * raw `Signal`s and `Opportunity`s. Multiple signals from different
 * collectors describing the same real-world change (e.g. the same model
 * release mentioned on GitHub and in a research-domain signal) merge into
 * one `IntelligenceEvent` instead of creating duplicate opportunities;
 * `sources` keeps every original observation as evidence rather than
 * discarding provenance.
 */
export interface IntelligenceEvent {
  id: string;
  category: EventCategory;
  title: string;
  summary: string;
  tags: string[];
  domains: IntelligenceDomain[];
  sources: EventSource[];
  /** Aggregate confidence across all merged sources — see normalizer.ts for the combination rule. */
  confidence: number;
  firstObservedAt: string;
  lastObservedAt: string;
  /** How many raw signals were merged into this canonical event. */
  occurrences: number;
}

export type { Signal, SignalKind };
