import { afterEach, describe, expect, it, vi } from "vitest";
import { createProductHuntCollector } from "./product-hunt-collector";

function item(overrides: { title?: string; link?: string; description?: string; cdata?: boolean } = {}): string {
  const title = overrides.title ?? "AshOS – An AI operating system for developers";
  const link = overrides.link ?? "https://www.producthunt.com/posts/ashos";
  const description = overrides.description ?? "AshOS brings agents, memory, and workflows into one local-first system.";
  const descriptionTag = overrides.cdata === false ? `<description>${description}</description>` : `<description><![CDATA[${description}]]></description>`;
  return `<item>
    <title>${title}</title>
    <link>${link}</link>
    ${descriptionTag}
    <pubDate>Thu, 06 Aug 2026 09:00:00 GMT</pubDate>
  </item>`;
}

function feed(items: string[]): string {
  return `<?xml version="1.0"?><rss><channel>${items.join("\n")}</channel></rss>`;
}

function textResponse(body: string, ok = true) {
  return { ok, status: ok ? 200 : 500, text: async () => body };
}

describe("createProductHuntCollector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("declares its identity", () => {
    const collector = createProductHuntCollector();
    expect(collector.id).toBe("product-hunt-live");
    expect(collector.domain).toBe("market");
  });

  it("parses RSS items into product-launch signals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(feed([item()]))));

    const collector = createProductHuntCollector({ categories: ["artificial-intelligence"] });
    const signals = await collector.collect();

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      domain: "market",
      kind: "product-launch",
      title: "AshOS – An AI operating system for developers",
      url: "https://www.producthunt.com/posts/ashos",
      source: "producthunt:rss"
    });
    expect(signals[0].summary).toContain("agents, memory, and workflows");
    expect(signals[0].tags).toContain("artificial-intelligence");
  });

  it("decodes a plain (non-CDATA) description", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(feed([item({ cdata: false, description: "Plain &amp; simple description" })]))));

    const collector = createProductHuntCollector({ categories: ["artificial-intelligence"] });
    const signals = await collector.collect();

    expect(signals[0].summary).toBe("Plain & simple description");
  });

  it("dedupes the same product appearing under multiple categories", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse(feed([item()])))
      .mockResolvedValueOnce(textResponse(feed([item()])));
    vi.stubGlobal("fetch", fetchMock);

    const collector = createProductHuntCollector({ categories: ["artificial-intelligence", "developer-tools"] });
    const signals = await collector.collect();

    expect(signals).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skips a failing category and returns whatever succeeded", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse("", false))
      .mockResolvedValueOnce(textResponse(feed([item({ link: "https://www.producthunt.com/posts/second", title: "Second product" })])));
    vi.stubGlobal("fetch", fetchMock);

    const collector = createProductHuntCollector({ categories: ["artificial-intelligence", "developer-tools"] });
    const signals = await collector.collect();

    expect(signals).toHaveLength(1);
    expect(signals[0].title).toBe("Second product");
  });

  it("respects perCategory as a cap on items parsed from one feed", async () => {
    const items = [1, 2, 3].map((i) => item({ link: `https://www.producthunt.com/posts/p${i}`, title: `Product ${i}` }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(feed(items))));

    const collector = createProductHuntCollector({ categories: ["artificial-intelligence"], perCategory: 2 });
    const signals = await collector.collect();

    expect(signals).toHaveLength(2);
  });

  it("returns an empty array when every request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const collector = createProductHuntCollector({ categories: ["artificial-intelligence"] });
    await expect(collector.collect()).resolves.toEqual([]);
  });
});
