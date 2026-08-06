import type { Signal } from "../types";
import type { Collector } from "./types";

const PRODUCT_HUNT_FEED_URL = "https://www.producthunt.com/feed";
const DEFAULT_CATEGORIES = ["artificial-intelligence", "developer-tools"];

export interface ProductHuntCollectorOptions {
  /** Product Hunt category slugs, e.g. "artificial-intelligence" -> `?category=artificial-intelligence`. */
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

/** RSS descriptions are commonly CDATA-wrapped (`<![CDATA[...]]>`); plain-text ones still need entity decoding. */
function extractRssTag(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  if (!match) return undefined;
  const cdata = match[1].match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  const raw = cdata ? cdata[1] : match[1];
  return decodeXmlEntities(raw).replace(/\s+/g, " ").trim();
}

/**
 * Real, network-backed collector for Product Hunt's public RSS feed
 * (`producthunt.com/feed`, `?category=` for a topic-filtered feed) —
 * no OAuth needed, unlike Product Hunt's official GraphQL API (v2), which
 * requires an authenticated developer token and so isn't usable without
 * user-supplied credentials this codebase doesn't ask for. Parsed with the
 * same small hand-rolled `<item>`-block regex extractor as
 * `arxiv-collector.ts`'s Atom parsing, rather than an XML dependency.
 *
 * This sandbox's network policy only allowlists `api.github.com` (see
 * `CLAUDE.md`), so — like the Hacker News/Reddit/arXiv/Hugging Face
 * collectors before it — this is real, tested code (mocked-fetch unit
 * tests) that has not been live-verified from this environment. Same
 * opt-in convention as the rest of `liveCollectors`: never registered on
 * `CollectorRegistry`, only reachable via `InnovationModule.runLiveDiscovery()`.
 */
export function createProductHuntCollector(options: ProductHuntCollectorOptions = {}): Collector {
  const categories = options.categories ?? DEFAULT_CATEGORIES;
  const perCategory = options.perCategory ?? 5;

  return {
    id: "product-hunt-live",
    domain: "market",
    description: "Real Product Hunt RSS collector: today's launched products in AI/developer-tools categories.",
    async collect(): Promise<Signal[]> {
      const observedAt = new Date().toISOString();
      const byLink = new Map<string, Signal>();

      for (const category of categories) {
        const url = `${PRODUCT_HUNT_FEED_URL}?category=${encodeURIComponent(category)}`;
        try {
          const res = await fetch(url, { headers: { "user-agent": "AshOS" } });
          if (!res.ok) continue;
          const xml = await res.text();
          const items = xml.split(/<item[\s>]/).slice(1);
          for (const raw of items.slice(0, perCategory)) {
            const title = extractRssTag(raw, "title");
            const link = extractRssTag(raw, "link");
            if (!title || !link || byLink.has(link)) continue;
            byLink.set(link, {
              id: `product-hunt-live-${link.split("/").filter(Boolean).pop()}`,
              domain: "market",
              kind: "product-launch",
              source: "producthunt:rss",
              title,
              summary: (extractRssTag(raw, "description") ?? `A new product launched on Product Hunt under "${category}".`).slice(0, 400),
              url: link,
              tags: [category],
              confidence: 0.6,
              observedAt,
              raw
            });
          }
        } catch {
          continue;
        }
      }

      return [...byLink.values()];
    }
  };
}
