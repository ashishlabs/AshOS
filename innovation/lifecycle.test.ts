import { describe, expect, it } from "vitest";
import { canTransition, nextStages, transition } from "./lifecycle";
import type { Opportunity } from "./types";

function opportunity(stage: Opportunity["stage"] = "captured"): Opportunity {
  const now = new Date().toISOString();
  return {
    id: "opp-1",
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
      overall: 0
    },
    stage,
    createdAt: now,
    updatedAt: now,
    history: []
  };
}

describe("idea lifecycle", () => {
  it("allows the documented forward path captured -> ... -> released", () => {
    const path: Opportunity["stage"][] = ["captured", "validated", "growing", "researching", "planning", "building", "testing", "released"];
    let current = opportunity("captured");
    for (const to of path.slice(1)) {
      current = transition(current, to);
      expect(current.stage).toBe(to);
    }
  });

  it("rejects an invalid transition", () => {
    expect(() => transition(opportunity("captured"), "released")).toThrow(/invalid idea lifecycle transition/);
  });

  it("allows archiving from any stage that has it as an option, and reviving afterward", () => {
    expect(canTransition("building", "archived")).toBe(true);
    const revived = transition(transition(opportunity("building"), "archived"), "revived");
    expect(revived.stage).toBe("revived");
  });

  it("records every transition in history with a timestamp", () => {
    const updated = transition(opportunity("captured"), "validated");
    expect(updated.history).toHaveLength(1);
    expect(updated.history[0].event).toBe("stage: captured -> validated");
  });

  it("exposes the allowed next stages for a given stage", () => {
    expect(nextStages("testing")).toEqual(["released", "building", "archived"]);
  });
});
