import type { IntelligenceDomain } from "../../kernel/config";
import { OPPORTUNITY_SCORE_DIMENSIONS, type BuilderProfile, type OpportunityScore, type OpportunityScoreDimension, type Signal } from "../types";

export type OpportunityScoreWeights = Record<OpportunityScoreDimension, number>;

export const DEFAULT_SCORE_WEIGHTS: OpportunityScoreWeights = Object.fromEntries(
  OPPORTUNITY_SCORE_DIMENSIONS.map((dim) => [dim, 1])
) as OpportunityScoreWeights;

/** Dimensions where a *lower* raw value is better — inverted before folding into `overall`. */
const COST_DIMENSIONS = new Set<OpportunityScoreDimension>(["competition", "technicalDifficulty", "buildTime"]);

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}

function hasDomain(signals: Signal[], domain: IntelligenceDomain): boolean {
  return signals.some((s) => s.domain === domain);
}

function countByKind(signals: Signal[], kind: Signal["kind"]): number {
  return signals.filter((s) => s.kind === kind).length;
}

function bestProfileMatch(signals: Signal[], profile?: BuilderProfile): number {
  if (!profile) return 0;
  const tags = new Set(signals.flatMap((s) => s.tags));
  const entries = Object.values(profile.categories).filter((c) => tags.has(c.category));
  if (entries.length === 0) return 0;
  const maxWeight = Math.max(...Object.values(profile.categories).map((c) => c.weight), 1);
  return clamp01(Math.max(...entries.map((c) => c.weight)) / maxWeight);
}

/**
 * Turns the raw evidence backing an opportunity (its signals, plus an
 * optional builder profile for personal-fit dimensions) into the 15-
 * dimension `OpportunityScore` from the design doc. Pure, dependency-free
 * heuristic logic (no LLM call) — same "Evaluator is pure logic" pattern as
 * `evolution/evaluation/evaluator.ts` — so it's cheap to unit test and to
 * retune without touching the engine that calls it. Scores continuously
 * update as new evidence arrives: call `score()` again with the full,
 * updated signal set every time an opportunity gains a signal.
 */
export class ScoringEngine {
  constructor(private readonly weights: OpportunityScoreWeights = DEFAULT_SCORE_WEIGHTS) {}

  score(signals: Signal[], profile?: BuilderProfile): OpportunityScore {
    const avgConfidence = average(signals.map((s) => s.confidence));
    const domains = new Set(signals.map((s) => s.domain));
    const countScale = clamp01(signals.length / 5);
    const profileMatch = bestProfileMatch(signals, profile);

    const dims: Record<OpportunityScoreDimension, number> = {
      marketDemand: clamp01(0.2 + 0.5 * avgConfidence * countScale + 0.1 * countScale),
      competition: clamp01(0.5 - 0.1 * countByKind(signals, "competitor-change")),
      revenuePotential: clamp01(0.3 + 0.2 * Number(domains.has("market")) + 0.2 * Number(domains.has("competitor")) + 0.1 * avgConfidence),
      automationPotential: clamp01(0.3 + 0.3 * Number(countByKind(signals, "workflow-friction") > 0) + 0.2 * Number(countByKind(signals, "feature-request") > 0)),
      aiAdvantage: clamp01(0.3 + 0.5 * Number(domains.has("research"))),
      technicalDifficulty: clamp01(0.3 + 0.1 * domains.size),
      buildTime: clamp01(0.3 + 0.08 * domains.size),
      distributionPotential: clamp01(0.3 + 0.25 * Number(domains.has("community")) + 0.25 * Number(domains.has("github"))),
      openSourcePotential: clamp01(0.3 + 0.5 * Number(domains.has("github"))),
      virality: clamp01(0.2 + 0.5 * Number(domains.has("community")) * avgConfidence),
      communityInterest: clamp01(0.2 + 0.15 * Math.min(countByKind(signals, "complaint") + countByKind(signals, "discussion") + countByKind(signals, "question"), 5)),
      strategicAlignment: clamp01(0.3 + 0.5 * profileMatch),
      personalFit: clamp01(0.2 + 0.6 * profileMatch),
      futureGrowth: clamp01(0.3 + 0.4 * avgConfidence + 0.1 * Math.min(signals.length, 3) / 3),
      confidence: clamp01(avgConfidence)
    };

    return { ...dims, overall: this.overall(dims) };
  }

  private overall(dims: Record<OpportunityScoreDimension, number>): number {
    let weightedSum = 0;
    let totalWeight = 0;
    for (const dim of OPPORTUNITY_SCORE_DIMENSIONS) {
      const weight = this.weights[dim] ?? 0;
      const value = COST_DIMENSIONS.has(dim) ? 1 - dims[dim] : dims[dim];
      weightedSum += weight * value;
      totalWeight += weight;
    }
    return clamp01(totalWeight > 0 ? weightedSum / totalWeight : 0);
  }
}
