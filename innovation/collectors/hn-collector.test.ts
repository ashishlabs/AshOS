import { afterEach, describe, expect, it, vi } from "vitest";
import { createHnCollector } from "./hn-collector";

function hit(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    objectID: "123",
    title: "New LLM breaks benchmarks",
    url: "https://example.com/post",
    points: 200,
    num_comments: 50,
    author: "someone",
    created_at: "2026-08-01T00:00:00Z",
    ...overrides
  };
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

describe("createHnCollector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("declares its identity", () => {
    const collector = createHnCollector();
    expect(collector.id).toBe("hn-live");
    expect(collector.domain).toBe("community");
  });

  it("converts HN Algolia hits into discussion signals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ hits: [hit()] })));

    const collector = createHnCollector({ queries: ["AI"] });
    const signals = await collector.collect();

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      domain: "community",
      kind: "discussion",
      title: "New LLM breaks benchmarks",
      url: "https://example.com/post",
      source: "hackernews:algolia-api"
    });
  });

  it("falls back to the HN item URL when a story has no external link", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ hits: [hit({ url: null })] })));

    const collector = createHnCollector({ queries: ["AI"] });
    const [signal] = await collector.collect();

    expect(signal.url).toBe("https://news.ycombinator.com/item?id=123");
  });

  it("dedupes the same story across multiple queries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ hits: [hit()] }))
      .mockResolvedValueOnce(jsonResponse({ hits: [hit()] }));
    vi.stubGlobal("fetch", fetchMock);

    const collector = createHnCollector({ queries: ["AI", "LLM"] });
    const signals = await collector.collect();

    expect(signals).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skips a failing query and returns whatever succeeded", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(jsonResponse({ hits: [hit({ objectID: "456" })] }));
    vi.stubGlobal("fetch", fetchMock);

    const collector = createHnCollector({ queries: ["AI", "LLM"] });
    const signals = await collector.collect();

    expect(signals).toHaveLength(1);
    expect(signals[0].id).toBe("hn-live-456");
  });

  it("returns an empty array when every request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const collector = createHnCollector({ queries: ["AI"] });
    await expect(collector.collect()).resolves.toEqual([]);
  });
});
