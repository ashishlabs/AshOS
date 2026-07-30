import type { Hypothesis } from "../engine/types";
import type { EvaluationDecision, ExperimentMetrics } from "../evaluation/types";
import type { BenchmarkRunResult } from "../benchmark/types";

export type ExperimentStatus = "pending" | "running" | "completed" | "error";
export type ExperimentOutcome = "accepted" | "rejected" | "error" | "pending";

/**
 * The full, persisted record of one experiment — the "database schema" for
 * the Evolution Engine. Stored as one JSON file per experiment under
 * `.ashos/evolution/experiments/<id>.json`, the same local-first,
 * no-external-DB pattern MemoryManager and PermissionManager already use.
 */
export interface ExperimentRecord {
  id: string;
  createdAt: string;
  finishedAt?: string;
  status: ExperimentStatus;

  hypothesis: Hypothesis;
  mutationId: string;
  mutationParams?: Record<string, unknown>;

  researchProvider: string;
  researchModel: string;

  gitBranch: string;
  gitCommit?: string;

  metrics?: ExperimentMetrics;
  benchmarkResults?: BenchmarkRunResult[];
  decision?: EvaluationDecision;

  result: ExperimentOutcome;
  reason?: string;
  logs: string[];
}
