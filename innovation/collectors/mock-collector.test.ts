import { describe, expect, it } from "vitest";
import { createMockCollector, DEFAULT_MOCK_SEEDS } from "./mock-collector";

describe("createMockCollector", () => {
  it("produces one Signal per seed, tagged with the domain and a fresh id", async () => {
    const collector = createMockCollector("market", DEFAULT_MOCK_SEEDS.market);
    const signals = await collector.collect();

    expect(signals).toHaveLength(DEFAULT_MOCK_SEEDS.market.length);
    expect(signals.every((s) => s.domain === "market")).toBe(true);
    expect(new Set(signals.map((s) => s.id)).size).toBe(signals.length);
  });

  it("defaults confidence to 0.5 when a seed doesn't specify one", async () => {
    const collector = createMockCollector("github", [{ kind: "repository", source: "test", title: "t", summary: "s", tags: [] }]);
    const [signal] = await collector.collect();
    expect(signal.confidence).toBe(0.5);
  });

  it("has default seed data for every intelligence domain", () => {
    for (const domain of ["market", "github", "community", "research", "workflow", "competitor"] as const) {
      expect(DEFAULT_MOCK_SEEDS[domain].length).toBeGreaterThan(0);
    }
  });

  it("is deterministic in content across calls (only id/timestamp vary)", async () => {
    const collector = createMockCollector("research", DEFAULT_MOCK_SEEDS.research);
    const [first] = await collector.collect();
    const [second] = await collector.collect();
    expect(first.title).toBe(second.title);
    expect(first.summary).toBe(second.summary);
  });
});
