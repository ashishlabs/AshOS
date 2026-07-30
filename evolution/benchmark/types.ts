export type BenchmarkCategory =
  | "code-generation"
  | "bug-fixing"
  | "documentation"
  | "github-research"
  | "reasoning"
  | "planning"
  | "workflow-execution"
  | "prompt-quality"
  | "api-generation"
  | "video-script-generation";

export interface BenchmarkRunResult {
  benchmarkId: string;
  category: BenchmarkCategory;
  score: number;
  passed: boolean;
  latencyMs: number;
  output: string;
  error?: string;
}

/**
 * A single scenario the Evolution Engine can measure quality against.
 * Deliberately one input/expected pair per benchmark (not a suite) so each
 * benchmark stays small and composable — register several for a category
 * rather than growing one into a test suite.
 */
export interface Benchmark {
  id: string;
  category: BenchmarkCategory;
  description: string;
  input: string;
  expectedOutput?: string;
  timeoutMs: number;
  metadata?: Record<string, unknown>;
  /** Returns a 0..1 quality score for the model's actual output. */
  score(actualOutput: string): number | Promise<number>;
}

export interface BenchmarkRunOptions {
  /** Score at/above this is considered a pass. Defaults to 0.6. */
  passThreshold?: number;
}
