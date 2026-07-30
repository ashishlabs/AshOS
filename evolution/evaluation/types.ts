export interface ExperimentMetrics {
  latencyMs: number;
  tokenUsage?: number;
  executionTimeMs: number;
  memoryUsageMb?: number;
  gpuUtilizationPercent?: number;
  toolCalls: number;
  /** 0..1 across whatever benchmark cases ran. */
  successRate: number;
  failureRate: number;
  compilationSuccess: boolean;
  testsPassed?: number;
  testsFailed?: number;
  /** 0..1 aggregate across benchmark run results. */
  benchmarkScore: number;
  /** 0..1, computed by Evaluator.finalize() — never set this by hand. */
  weightedOverallScore: number;
}

export interface EvaluationWeights {
  benchmarkScore: number;
  latency: number;
  successRate: number;
  tokenEfficiency: number;
}

export const DEFAULT_EVALUATION_WEIGHTS: EvaluationWeights = {
  benchmarkScore: 0.5,
  latency: 0.2,
  successRate: 0.2,
  tokenEfficiency: 0.1
};

export interface EvaluationDecision {
  accepted: boolean;
  reason: string;
  baselineScore: number;
  candidateScore: number;
  delta: number;
}
