import { describe, expect, it } from "vitest";
import { CollectorRegistry } from "./registry";
import { createMockCollector, DEFAULT_MOCK_SEEDS } from "./mock-collector";

describe("CollectorRegistry", () => {
  it("registers, gets and lists collectors", () => {
    const registry = new CollectorRegistry();
    const collector = createMockCollector("market", DEFAULT_MOCK_SEEDS.market);
    registry.register(collector);

    expect(registry.get(collector.id)).toBe(collector);
    expect(registry.list()).toEqual([collector]);
  });

  it("filters collectors by domain", () => {
    const registry = new CollectorRegistry();
    registry.register(createMockCollector("market", DEFAULT_MOCK_SEEDS.market));
    registry.register(createMockCollector("github", DEFAULT_MOCK_SEEDS.github));

    expect(registry.byDomain("market")).toHaveLength(1);
    expect(registry.byDomain("github")[0].domain).toBe("github");
    expect(registry.byDomain("competitor")).toHaveLength(0);
  });
});
