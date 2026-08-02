import { describe, expect, it } from "vitest";
import { buildRadarEntry, classify, computeEvidence } from "./classify";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-08-02T00:00:00Z").getTime();

function daysAgo(days: number): string {
  return new Date(NOW - days * DAY_MS).toISOString();
}

describe("computeEvidence", () => {
  it("computes days-since and a mentions-per-day rate", () => {
    const evidence = computeEvidence(10, daysAgo(20), daysAgo(1), NOW);
    expect(evidence.totalMentions).toBe(10);
    expect(evidence.daysSinceFirstSeen).toBeCloseTo(20, 0);
    expect(evidence.daysSinceLastSeen).toBeCloseTo(1, 0);
    expect(evidence.mentionsPerDay).toBeCloseTo(0.5, 1);
  });

  it("never divides by zero for a same-day node", () => {
    const evidence = computeEvidence(3, daysAgo(0), daysAgo(0), NOW);
    expect(Number.isFinite(evidence.mentionsPerDay)).toBe(true);
  });
});

describe("classify", () => {
  it("classifies a technology unseen for 6+ months as obsolete regardless of past volume", () => {
    expect(classify(computeEvidence(500, daysAgo(400), daysAgo(200), NOW))).toBe("obsolete");
  });

  it("classifies a technology unseen for 60-180 days as declining", () => {
    expect(classify(computeEvidence(50, daysAgo(200), daysAgo(90), NOW))).toBe("declining");
  });

  it("classifies a brand-new, already-corroborated technology as emerging", () => {
    expect(classify(computeEvidence(2, daysAgo(5), daysAgo(1), NOW))).toBe("emerging");
  });

  it("classifies a sustained-high-frequency technology as growing", () => {
    expect(classify(computeEvidence(60, daysAgo(60), daysAgo(1), NOW))).toBe("growing");
  });

  it("classifies a mature, occasionally-mentioned technology as stable", () => {
    expect(classify(computeEvidence(20, daysAgo(200), daysAgo(10), NOW))).toBe("stable");
  });
});

describe("buildRadarEntry", () => {
  it("bundles the technology label with its classification and evidence", () => {
    const entry = buildRadarEntry("agents", 2, daysAgo(5), daysAgo(1), NOW);
    expect(entry.technology).toBe("agents");
    expect(entry.ring).toBe("emerging");
    expect(entry.evidence.totalMentions).toBe(2);
    expect(entry.evaluatedAt).toBe(new Date(NOW).toISOString());
  });
});
