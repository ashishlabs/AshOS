import { afterEach, describe, expect, it, vi } from "vitest";
import { createHuggingFaceCollector } from "./huggingface-collector";

function model(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "acme/tiny-llm",
    likes: 400,
    downloads: 10000,
    pipeline_tag: "text-generation",
    tags: ["pytorch"],
    lastModified: "2026-08-01T00:00:00Z",
    ...overrides
  };
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

describe("createHuggingFaceCollector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("declares its identity", () => {
    const collector = createHuggingFaceCollector();
    expect(collector.id).toBe("huggingface-live");
    expect(collector.domain).toBe("research");
  });

  it("converts trending models into model-release signals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([model()])));

    const collector = createHuggingFaceCollector();
    const signals = await collector.collect();

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      domain: "research",
      kind: "model-release",
      title: "acme/tiny-llm",
      url: "https://huggingface.co/acme/tiny-llm",
      source: "huggingface:models-api"
    });
    expect(signals[0].tags).toEqual(expect.arrayContaining(["text-generation", "pytorch"]));
  });

  it("scales confidence with likes, capped below 1", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([model({ likes: 100_000 })])));

    const collector = createHuggingFaceCollector();
    const [signal] = await collector.collect();

    expect(signal.confidence).toBeLessThanOrEqual(0.9);
  });

  it("returns an empty array (not a throw) on a failed request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));

    const collector = createHuggingFaceCollector();
    await expect(collector.collect()).resolves.toEqual([]);
  });

  it("returns an empty array on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const collector = createHuggingFaceCollector();
    await expect(collector.collect()).resolves.toEqual([]);
  });
});
