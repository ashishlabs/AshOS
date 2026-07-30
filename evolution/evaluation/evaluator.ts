import { DEFAULT_EVALUATION_WEIGHTS, type EvaluationDecision, type EvaluationWeights, type ExperimentMetrics } from "./types";

export interface EvaluatorOptions {
  weights?: EvaluationWeights;
  /** Latency (ms) at/above which the latency score component bottoms out at 0. Defaults to 30s. */
  maxAcceptableLatencyMs?: number;
  /** Token usage at/above which the token-efficiency component bottoms out at 0. Defaults to 8000. */
  maxAcceptableTokens?: number;
  /** Candidate must beat baseline's weighted score by at least this much to be accepted. Defaults to 0.01. */
  minImprovement?: number;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Turns raw run metrics into a single 0..1 weighted score, and decides
 * whether a candidate experiment beats the baseline enough to accept.
 * Kept as pure, dependency-free logic so it's trivial to unit test and to
 * retune weights without touching the engine or storage layers.
 */
export class Evaluator {
  constructor(private readonly options: EvaluatorOptions = {}) {}

  computeWeightedScore(metrics: Omit<ExperimentMetrics, "weightedOverallScore">): number {
    const weights = this.options.weights ?? DEFAULT_EVALUATION_WEIGHTS;
    const maxLatency = this.options.maxAcceptableLatencyMs ?? 30_000;
    const maxTokens = this.options.maxAcceptableTokens ?? 8000;

    const latencyScore = clamp01(1 - metrics.latencyMs / maxLatency);
    const tokenScore = metrics.tokenUsage != null ? clamp01(1 - metrics.tokenUsage / maxTokens) : 1;

    const totalWeight = weights.benchmarkScore + weights.latency + weights.successRate + weights.tokenEfficiency;
    const weighted =
      weights.benchmarkScore * metrics.benchmarkScore +
      weights.latency * latencyScore +
      weights.successRate * metrics.successRate +
      weights.tokenEfficiency * tokenScore;

    return clamp01(totalWeight > 0 ? weighted / totalWeight : 0);
  }

  /** Fills in weightedOverallScore from the rest of the metrics. */
  finalize(metrics: Omit<ExperimentMetrics, "weightedOverallScore">): ExperimentMetrics {
    return { ...metrics, weightedOverallScore: this.computeWeightedScore(metrics) };
  }

  /**
   * Accept/reject decision. Compilation failures and (when requireTests is
   * set) failing tests are hard rejections regardless of score — a
   * regression never gets accepted just because latency improved.
   */
  compare(baseline: ExperimentMetrics, candidate: ExperimentMetrics, requireTests = true): EvaluationDecision {
    const baselineScore = baseline.weightedOverallScore;
    const candidateScore = candidate.weightedOverallScore;
    const delta = candidateScore - baselineScore;

    if (!candidate.compilationSuccess) {
      return { accepted: false, reason: "candidate failed to build", baselineScore, candidateScore, delta };
    }
    if (requireTests && (candidate.testsFailed ?? 0) > 0) {
      return {
        accepted: false,
        reason: `candidate has ${candidate.testsFailed} failing test(s)`,
        baselineScore,
        candidateScore,
        delta
      };
    }

    const minImprovement = this.options.minImprovement ?? 0.01;
    if (delta < minImprovement) {
      return {
        accepted: false,
        reason: `no meaningful improvement over baseline (Δ${delta.toFixed(3)} < ${minImprovement})`,
        baselineScore,
        candidateScore,
        delta
      };
    }

    return { accepted: true, reason: `improved weighted score by Δ${delta.toFixed(3)}`, baselineScore, candidateScore, delta };
  }
}
