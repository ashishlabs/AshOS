import type { Benchmark, BenchmarkCategory } from "./types";

/** Catalog of every benchmark the Evolution Engine can run, discoverable like tools/agents. */
export class BenchmarkRegistry {
  private benchmarks = new Map<string, Benchmark>();

  register(benchmark: Benchmark): void {
    this.benchmarks.set(benchmark.id, benchmark);
  }

  get(id: string): Benchmark | undefined {
    return this.benchmarks.get(id);
  }

  list(): Benchmark[] {
    return [...this.benchmarks.values()];
  }

  byCategory(category: BenchmarkCategory): Benchmark[] {
    return this.list().filter((b) => b.category === category);
  }
}
