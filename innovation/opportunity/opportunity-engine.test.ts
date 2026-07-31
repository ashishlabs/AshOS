import { describe, expect, it } from "vitest";
import { OpportunityEngine } from "./opportunity-engine";
import { ScoringEngine } from "./scoring";
import type { Signal } from "../types";

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: overrides.id ?? "s1",
    domain: "market",
    kind: "funding",
    source: "test",
    title: "Signal title",
    summary: "Signal summary",
    tags: ["ai-agents", "automation"],
    confidence: 0.5,
    observedAt: new Date().toISOString(),
    ...overrides
  };
}

describe("OpportunityEngine", () => {
  it("creates a new opportunity from a signal that matches nothing", () => {
    const engine = new OpportunityEngine({ scoring: new ScoringEngine(), mergeThreshold: 0.5 });
    const { opportunity, opportunities, created } = engine.ingest([], signal());

    expect(created).toBe(true);
    expect(opportunities).toHaveLength(1);
    expect(opportunity.signals).toHaveLength(1);
    expect(opportunity.stage).toBe("captured");
  });

  it("merges a signal with high tag overlap into the existing opportunity instead of creating a new one", () => {
    const engine = new OpportunityEngine({ scoring: new ScoringEngine(), mergeThreshold: 0.5 });
    const first = engine.ingest([], signal({ id: "s1", tags: ["ai-agents", "automation"] }));
    const second = engine.ingest(first.opportunities, signal({ id: "s2", tags: ["ai-agents", "automation", "extra"] }));

    expect(second.created).toBe(false);
    expect(second.opportunities).toHaveLength(1);
    expect(second.opportunity.signals.map((s) => s.id).sort()).toEqual(["s1", "s2"]);
  });

  it("creates a separate opportunity for a signal with low tag overlap", () => {
    const engine = new OpportunityEngine({ scoring: new ScoringEngine(), mergeThreshold: 0.5 });
    const first = engine.ingest([], signal({ id: "s1", tags: ["fintech"] }));
    const second = engine.ingest(first.opportunities, signal({ id: "s2", tags: ["healthcare", "robotics"] }));

    expect(second.created).toBe(true);
    expect(second.opportunities).toHaveLength(2);
  });

  it("is idempotent — re-ingesting the exact same signal id doesn't duplicate it in the opportunity", () => {
    const engine = new OpportunityEngine({ scoring: new ScoringEngine(), mergeThreshold: 0.5 });
    const first = engine.ingest([], signal({ id: "s1" }));
    const second = engine.ingest(first.opportunities, signal({ id: "s1" }));

    expect(second.opportunity.signals).toHaveLength(1);
  });

  it("recomputes the opportunity score after a merge", () => {
    const engine = new OpportunityEngine({ scoring: new ScoringEngine(), mergeThreshold: 0.5 });
    const first = engine.ingest([], signal({ id: "s1", confidence: 0.2 }));
    const second = engine.ingest(first.opportunities, signal({ id: "s2", confidence: 0.9, tags: ["ai-agents", "automation"] }));

    expect(second.opportunity.score.confidence).toBeGreaterThan(first.opportunity.score.confidence);
  });
});
