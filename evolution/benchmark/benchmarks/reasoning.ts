import type { Benchmark } from "../types";

const EXPECTED_CONCEPTS = ["test", "lint", "typecheck", "parallel", "pipeline", "workflow", "commit", "push", "build"];

/**
 * Reasoning/planning benchmark: ask the model to decompose a realistic
 * dev-ops goal into ordered steps and call out parallelism. Scored by
 * keyword coverage against the concepts a competent plan should mention —
 * a coarse but cheap proxy for planning quality that stays legible.
 */
export const reasoningPlanningBenchmark: Benchmark = {
  id: "reasoning-ci-setup-plan",
  category: "reasoning",
  description: "Decompose 'set up CI for this repository' into an ordered, partly-parallel plan",
  input:
    "A user asks: 'Set up CI for this repository.' List the ordered steps you would take, and call out any steps that could safely run in parallel with each other.",
  timeoutMs: 30_000,
  metadata: { difficulty: "medium" },
  score(actualOutput: string): number {
    const lower = actualOutput.toLowerCase();
    const hits = EXPECTED_CONCEPTS.filter((concept) => lower.includes(concept)).length;
    return hits / EXPECTED_CONCEPTS.length;
  }
};
