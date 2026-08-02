import { afterEach, describe, expect, it, vi } from "vitest";
import { createGithubReleasesCollector } from "./github-releases-collector";

function repoItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    full_name: "acme/widget",
    html_url: "https://github.com/acme/widget",
    description: "A widget",
    stargazers_count: 100,
    language: "TypeScript",
    topics: ["ai"],
    pushed_at: "2026-08-01T00:00:00Z",
    ...overrides
  };
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

describe("createGithubReleasesCollector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("declares its identity for the CollectorRegistry", () => {
    const collector = createGithubReleasesCollector();
    expect(collector.id).toBe("github-live");
    expect(collector.domain).toBe("github");
  });

  it("converts real GitHub search results into repository signals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ items: [repoItem()] })));

    const collector = createGithubReleasesCollector({ topics: ["ai"] });
    const signals = await collector.collect();

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      domain: "github",
      kind: "repository",
      title: "acme/widget",
      url: "https://github.com/acme/widget",
      source: "github:search-api"
    });
    expect(signals[0].tags).toEqual(expect.arrayContaining(["typescript", "ai"]));
  });

  it("dedupes the same repo appearing under multiple topics", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ items: [repoItem()] }))
      .mockResolvedValueOnce(jsonResponse({ items: [repoItem()] }));
    vi.stubGlobal("fetch", fetchMock);

    const collector = createGithubReleasesCollector({ topics: ["ai", "developer-tools"] });
    const signals = await collector.collect();

    expect(signals).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skips a failing topic and returns whatever succeeded", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false))
      .mockResolvedValueOnce(jsonResponse({ items: [repoItem({ full_name: "acme/second" })] }));
    vi.stubGlobal("fetch", fetchMock);

    const collector = createGithubReleasesCollector({ topics: ["ai", "llm"] });
    const signals = await collector.collect();

    expect(signals).toHaveLength(1);
    expect(signals[0].title).toBe("acme/second");
  });

  it("returns an empty array (not a throw) when every request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const collector = createGithubReleasesCollector({ topics: ["ai"] });
    await expect(collector.collect()).resolves.toEqual([]);
  });

  it("scales confidence with star count, capped below 1", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ items: [repoItem({ stargazers_count: 500_000 })] })));

    const collector = createGithubReleasesCollector({ topics: ["ai"] });
    const [signal] = await collector.collect();

    expect(signal.confidence).toBeLessThanOrEqual(0.95);
    expect(signal.confidence).toBeGreaterThan(0.5);
  });
});
