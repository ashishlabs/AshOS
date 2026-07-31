import { describe, expect, it } from "vitest";
import { ScoringEngine } from "./scoring";
import type { BuilderProfile, Signal } from "../types";

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "s1",
    domain: "market",
    kind: "funding",
    source: "test",
    title: "t",
    summary: "s",
    tags: ["ai"],
    confidence: 0.5,
    observedAt: new Date().toISOString(),
    ...overrides
  };
}

describe("ScoringEngine", () => {
  it("keeps every dimension and overall within [0, 1]", () => {
    const engine = new ScoringEngine();
    const score = engine.score([signal({ confidence: 1 }), signal({ id: "s2", confidence: 1, domain: "github" })]);
    for (const value of Object.values(score)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("returns a low, defined score for zero signals rather than throwing", () => {
    const engine = new ScoringEngine();
    const score = engine.score([]);
    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(score.overall)).toBe(false);
  });

  it("raises marketDemand and confidence as evidence count/confidence increase", () => {
    const engine = new ScoringEngine();
    const low = engine.score([signal({ confidence: 0.2 })]);
    const high = engine.score([signal({ confidence: 0.9 }), signal({ id: "s2", confidence: 0.9 }), signal({ id: "s3", confidence: 0.9 })]);

    expect(high.marketDemand).toBeGreaterThan(low.marketDemand);
    expect(high.confidence).toBeGreaterThan(low.confidence);
  });

  it("rewards github-domain evidence with higher openSourcePotential", () => {
    const engine = new ScoringEngine();
    const withoutGithub = engine.score([signal({ domain: "market" })]);
    const withGithub = engine.score([signal({ domain: "github", kind: "repository" })]);

    expect(withGithub.openSourcePotential).toBeGreaterThan(withoutGithub.openSourcePotential);
  });

  it("raises strategicAlignment/personalFit when tags match the builder profile", () => {
    const engine = new ScoringEngine();
    const profile: BuilderProfile = {
      updatedAt: new Date().toISOString(),
      categories: { "developer-tools": { category: "developer-tools", weight: 10, signalCount: 5 } }
    };

    const matching = engine.score([signal({ tags: ["developer-tools"] })], profile);
    const nonMatching = engine.score([signal({ tags: ["healthcare"] })], profile);

    expect(matching.strategicAlignment).toBeGreaterThan(nonMatching.strategicAlignment);
    expect(matching.personalFit).toBeGreaterThan(nonMatching.personalFit);
  });

  it("inverts cost-like dimensions (competition, technicalDifficulty, buildTime) when folding into overall", () => {
    const equalWeights = new ScoringEngine();
    const onlyCompetition = new ScoringEngine(
      Object.fromEntries(Object.keys(equalWeights.score([signal()])).map((k) => [k, k === "competition" ? 1 : 0])) as never
    );
    const fewCompetitorSignals = onlyCompetition.score([signal({ kind: "funding" })]);
    const manyCompetitorSignals = onlyCompetition.score([
      signal({ kind: "competitor-change" }),
      signal({ id: "s2", kind: "competitor-change" }),
      signal({ id: "s3", kind: "competitor-change" })
    ]);

    // more competitor-change evidence lowers the raw `competition` dimension (less unknown competition),
    // and since it's a cost dimension, overall (weighted only on it) should go *up*.
    expect(manyCompetitorSignals.competition).toBeLessThan(fewCompetitorSignals.competition);
    expect(manyCompetitorSignals.overall).toBeGreaterThan(fewCompetitorSignals.overall);
  });
});
