/** What kind of thing a mutation changes. Mirrors the "what can evolve" surface. */
export type MutationTargetKind =
  | "prompt"
  | "workflow"
  | "agent"
  | "planner"
  | "provider-routing"
  | "tool-selection"
  | "memory-ranking"
  | "retry-logic"
  | "temperature"
  | "context-size"
  | "reasoning-strategy";

/** Structured form of the researcher's response to the improvement prompt. */
export interface Hypothesis {
  summary: string;
  filesToModify: string[];
  implementationPlan: string;
  expectedImpact: string;
  risks: string;
  benchmarkStrategy: string;
  /** Which registered Mutation this hypothesis should be carried out by. */
  mutationId: string;
  mutationParams?: Record<string, unknown>;
}

/** A point-in-time read of the system, given to the researcher as context. */
export interface SystemSnapshot {
  timestamp: string;
  activeProvider: string;
  registeredMutations: string[];
  registeredBenchmarks: string[];
  /** benchmarkId -> most recent accepted score, from experiment history. */
  recentBenchmarkScores: Record<string, number>;
  /** Short human-readable summaries of the most recent kernel events. */
  recentActivity: string[];
}

export interface EvolutionCycleOptions {
  /** Caps total experiments across the whole run. Falls back to config.evolution.maxExperiments. */
  maxExperiments?: number;
  /** Caps how many experiments execute concurrently. Falls back to config.evolution.parallelExperiments. */
  parallelExperiments?: number;
  /** Restrict which benchmarks are eligible this cycle; defaults to all registered. */
  benchmarkIds?: string[];
}
