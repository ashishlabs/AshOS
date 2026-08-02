import type { Signal } from "../types";
import type { Collector } from "./types";

interface HnHit {
  objectID: string;
  title: string | null;
  url: string | null;
  points: number | null;
  num_comments: number | null;
  author: string | null;
  created_at: string;
}

const HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search";
const DEFAULT_QUERIES = ["AI", "LLM", "machine learning"];

export interface HnCollectorOptions {
  queries?: string[];
  perQuery?: number;
}

/**
 * Real, network-backed collector for Hacker News stories via the (keyless,
 * CORS-friendly) Algolia HN Search API — same "opt-in, never registered on
 * CollectorRegistry" convention as `github-releases-collector.ts`: it only
 * runs via `InnovationModule.runLiveDiscovery()` / `ash innovation discover
 * --live`, never by default.
 */
export function createHnCollector(options: HnCollectorOptions = {}): Collector {
  const queries = options.queries ?? DEFAULT_QUERIES;
  const perQuery = options.perQuery ?? 5;

  return {
    id: "hn-live",
    domain: "community",
    description: "Real Hacker News (Algolia Search API) collector: recent AI/LLM story discussions.",
    async collect(): Promise<Signal[]> {
      const observedAt = new Date().toISOString();
      const byId = new Map<string, Signal>();

      for (const query of queries) {
        const url = `${HN_SEARCH_URL}?tags=story&query=${encodeURIComponent(query)}&hitsPerPage=${perQuery}`;
        try {
          const res = await fetch(url, { headers: { "user-agent": "AshOS" } });
          if (!res.ok) continue;
          const body = (await res.json()) as { hits?: HnHit[] };
          for (const hit of body.hits ?? []) {
            if (!hit.title || byId.has(hit.objectID)) continue;
            const points = hit.points ?? 0;
            byId.set(hit.objectID, {
              id: `hn-live-${hit.objectID}`,
              domain: "community",
              kind: "discussion",
              source: "hackernews:algolia-api",
              title: hit.title,
              summary: `${points} point(s), ${hit.num_comments ?? 0} comment(s) on Hacker News.`,
              url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
              tags: [query.toLowerCase()],
              confidence: Math.min(0.9, 0.4 + points / 1000),
              observedAt,
              raw: hit
            });
          }
        } catch {
          continue;
        }
      }

      return [...byId.values()];
    }
  };
}
