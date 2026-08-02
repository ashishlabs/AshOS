import { afterEach, describe, expect, it, vi } from "vitest";
import { createArxivCollector } from "./arxiv-collector";

function entry(overrides: { id?: string; title?: string; summary?: string; categories?: string[] } = {}): string {
  const id = overrides.id ?? "http://arxiv.org/abs/2301.00001v1";
  const title = overrides.title ?? "A Study of Large Language Models";
  const summary = overrides.summary ?? "We study large language models and their emergent behavior.";
  const categories = overrides.categories ?? ["cs.AI"];
  return `<entry>
    <id>${id}</id>
    <title>${title}</title>
    <summary>${summary}</summary>
    ${categories.map((c) => `<category term="${c}"/>`).join("\n")}
  </entry>`;
}

function feed(entries: string[]): string {
  return `<?xml version="1.0"?><feed>${entries.join("\n")}</feed>`;
}

function textResponse(body: string, ok = true) {
  return { ok, status: ok ? 200 : 500, text: async () => body };
}

describe("createArxivCollector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("declares its identity", () => {
    const collector = createArxivCollector();
    expect(collector.id).toBe("arxiv-live");
    expect(collector.domain).toBe("research");
  });

  it("parses Atom entries into paper signals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(textResponse(feed([entry()]))));

    const collector = createArxivCollector({ categories: ["cs.AI"] });
    const signals = await collector.collect();

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      domain: "research",
      kind: "paper",
      title: "A Study of Large Language Models",
      url: "http://arxiv.org/abs/2301.00001v1",
      source: "arxiv:api"
    });
    expect(signals[0].tags).toContain("cs.ai");
  });

  it("dedupes the same paper appearing under multiple categories", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse(feed([entry()])))
      .mockResolvedValueOnce(textResponse(feed([entry()])));
    vi.stubGlobal("fetch", fetchMock);

    const collector = createArxivCollector({ categories: ["cs.AI", "cs.CL"] });
    const signals = await collector.collect();

    expect(signals).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skips a failing category and returns whatever succeeded", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse("", false))
      .mockResolvedValueOnce(textResponse(feed([entry({ id: "http://arxiv.org/abs/2301.00002v1", title: "Second paper" })])));
    vi.stubGlobal("fetch", fetchMock);

    const collector = createArxivCollector({ categories: ["cs.AI", "cs.CL"] });
    const signals = await collector.collect();

    expect(signals).toHaveLength(1);
    expect(signals[0].title).toBe("Second paper");
  });

  it("returns an empty array when every request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const collector = createArxivCollector({ categories: ["cs.AI"] });
    await expect(collector.collect()).resolves.toEqual([]);
  });
});
