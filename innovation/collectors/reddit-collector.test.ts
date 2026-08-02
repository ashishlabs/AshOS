import { afterEach, describe, expect, it, vi } from "vitest";
import { createRedditCollector } from "./reddit-collector";

function post(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "abc123",
    title: "Anyone tried the new open-weight model?",
    url: "https://reddit.com/r/MachineLearning/comments/abc123/post",
    permalink: "/r/MachineLearning/comments/abc123/post",
    ups: 300,
    num_comments: 40,
    selftext: "",
    created_utc: 1785600000,
    ...overrides
  };
}

function listing(posts: unknown[]) {
  return { data: { children: posts.map((data) => ({ data })) } };
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

describe("createRedditCollector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("declares its identity", () => {
    const collector = createRedditCollector();
    expect(collector.id).toBe("reddit-live");
    expect(collector.domain).toBe("community");
  });

  it("converts top-of-day posts into discussion signals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(listing([post()]))));

    const collector = createRedditCollector({ subreddits: ["MachineLearning"] });
    const signals = await collector.collect();

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      domain: "community",
      kind: "discussion",
      title: "Anyone tried the new open-weight model?",
      source: "reddit:r/MachineLearning"
    });
  });

  it("falls back to the permalink when a post has a relative/self URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(listing([post({ url: "self.MachineLearning" })]))));

    const collector = createRedditCollector({ subreddits: ["MachineLearning"] });
    const [signal] = await collector.collect();

    expect(signal.url).toBe("https://reddit.com/r/MachineLearning/comments/abc123/post");
  });

  it("dedupes the same post across subreddits and skips a failing one", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(listing([post()])))
      .mockRejectedValueOnce(new Error("429"));
    vi.stubGlobal("fetch", fetchMock);

    const collector = createRedditCollector({ subreddits: ["MachineLearning", "artificial"] });
    const signals = await collector.collect();

    expect(signals).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns an empty array when every request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const collector = createRedditCollector({ subreddits: ["MachineLearning"] });
    await expect(collector.collect()).resolves.toEqual([]);
  });
});
