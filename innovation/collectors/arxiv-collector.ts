import type { Signal } from "../types";
import type { Collector } from "./types";

const ARXIV_API_URL = "https://export.arxiv.org/api/query";
const DEFAULT_CATEGORIES = ["cs.AI", "cs.CL", "cs.LG"];

export interface ArxivCollectorOptions {
  categories?: string[];
  perCategory?: number;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractTag(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? decodeXmlEntities(match[1]).replace(/\s+/g, " ").trim() : undefined;
}

function extractCategories(block: string): string[] {
  return [...block.matchAll(/<category\s+term="([^"]+)"/g)].map((m) => m[1]);
}

/**
 * Real, network-backed collector for arXiv's public Atom API — parsed with a
 * small hand-rolled extractor (a handful of regexes over `<entry>` blocks)
 * rather than pulling in an XML dependency, matching the rest of AshOS's
 * "raw fetch, no SDK dependency" convention. Same opt-in convention as
 * `github-releases-collector.ts` — never registered on `CollectorRegistry`,
 * only reachable via `InnovationModule.runLiveDiscovery()`.
 */
export function createArxivCollector(options: ArxivCollectorOptions = {}): Collector {
  const categories = options.categories ?? DEFAULT_CATEGORIES;
  const perCategory = options.perCategory ?? 5;

  return {
    id: "arxiv-live",
    domain: "research",
    description: "Real arXiv API collector: recently submitted papers in AI/NLP/ML categories.",
    async collect(): Promise<Signal[]> {
      const observedAt = new Date().toISOString();
      const byId = new Map<string, Signal>();

      for (const category of categories) {
        const query = `search_query=cat:${encodeURIComponent(category)}&sortBy=submittedDate&sortOrder=descending&max_results=${perCategory}`;
        const url = `${ARXIV_API_URL}?${query}`;
        try {
          const res = await fetch(url, { headers: { "user-agent": "AshOS" } });
          if (!res.ok) continue;
          const xml = await res.text();
          const entries = xml.split("<entry>").slice(1);
          for (const raw of entries) {
            const id = extractTag(raw, "id");
            const title = extractTag(raw, "title");
            if (!id || !title || byId.has(id)) continue;
            byId.set(id, {
              id: `arxiv-live-${id.split("/").pop()}`,
              domain: "research",
              kind: "paper",
              source: "arxiv:api",
              title,
              summary: (extractTag(raw, "summary") ?? "").slice(0, 400),
              url: id,
              tags: extractCategories(raw).map((c) => c.toLowerCase()),
              confidence: 0.65,
              observedAt,
              raw
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
