import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OpportunityStore } from "./opportunity-store";
import type { Opportunity } from "../types";

function opportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? "opp-1",
    title: "t",
    problemStatement: "p",
    tags: [],
    domains: [],
    signals: [],
    score: {
      marketDemand: 0,
      competition: 0,
      revenuePotential: 0,
      automationPotential: 0,
      aiAdvantage: 0,
      technicalDifficulty: 0,
      buildTime: 0,
      distributionPotential: 0,
      openSourcePotential: 0,
      virality: 0,
      communityInterest: 0,
      strategicAlignment: 0,
      personalFit: 0,
      futureGrowth: 0,
      confidence: 0,
      overall: 0.5,
      ...overrides.score
    },
    stage: "captured",
    createdAt: now,
    updatedAt: now,
    history: [],
    ...overrides
  };
}

describe("OpportunityStore", () => {
  let root: string;
  let store: OpportunityStore;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-opp-store-"));
    store = new OpportunityStore(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns an empty list before anything is saved", () => {
    expect(store.list()).toEqual([]);
    expect(store.get("missing")).toBeUndefined();
  });

  it("saves and retrieves an opportunity by id", () => {
    store.save(opportunity({ id: "opp-1" }));
    expect(store.get("opp-1")?.id).toBe("opp-1");
  });

  it("lists opportunities most-recently-updated first", () => {
    store.save(opportunity({ id: "old", updatedAt: "2024-01-01T00:00:00.000Z" }));
    store.save(opportunity({ id: "new", updatedAt: "2025-01-01T00:00:00.000Z" }));

    expect(store.list().map((o) => o.id)).toEqual(["new", "old"]);
  });

  it("filters by lifecycle stage", () => {
    store.save(opportunity({ id: "a", stage: "captured" }));
    store.save(opportunity({ id: "b", stage: "building" }));

    expect(store.byStage("building").map((o) => o.id)).toEqual(["b"]);
  });

  it("ranks topOpportunities by score.overall descending", () => {
    store.save(opportunity({ id: "low", score: { overall: 0.2 } as never }));
    store.save(opportunity({ id: "high", score: { overall: 0.9 } as never }));

    expect(store.topOpportunities(2).map((o) => o.id)).toEqual(["high", "low"]);
  });
});
