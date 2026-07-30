import type { AgentContext } from "../../agents/types";
import type { Benchmark, BenchmarkRunOptions, BenchmarkRunResult } from "./types";

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Runs a single Benchmark against the active provider and scores the
 * result. Benchmarks talk to `context.provider` directly (rather than a
 * specific agent) so the same benchmark can measure any provider/model
 * combination the Evolution Engine is comparing.
 */
export class BenchmarkRunner {
  async run(benchmark: Benchmark, context: AgentContext, options: BenchmarkRunOptions = {}): Promise<BenchmarkRunResult> {
    const passThreshold = options.passThreshold ?? 0.6;
    const start = performance.now();

    try {
      const result = await withTimeout(
        context.provider.chat([{ role: "user", content: benchmark.input }]),
        benchmark.timeoutMs,
        `benchmark "${benchmark.id}" timed out after ${benchmark.timeoutMs}ms`
      );
      const latencyMs = performance.now() - start;
      const score = await benchmark.score(result.content);

      return {
        benchmarkId: benchmark.id,
        category: benchmark.category,
        score,
        passed: score >= passThreshold,
        latencyMs,
        output: result.content
      };
    } catch (error) {
      return {
        benchmarkId: benchmark.id,
        category: benchmark.category,
        score: 0,
        passed: false,
        latencyMs: performance.now() - start,
        output: "",
        error: (error as Error).message
      };
    }
  }

  async runAll(benchmarks: Benchmark[], context: AgentContext, options: BenchmarkRunOptions = {}): Promise<BenchmarkRunResult[]> {
    return Promise.all(benchmarks.map((b) => this.run(b, context, options)));
  }
}
