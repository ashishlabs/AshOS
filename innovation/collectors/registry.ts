import type { IntelligenceDomain } from "../../kernel/config";
import type { Collector } from "./types";

/** Catalog of every collector available to the intelligence agents — same shape as MutationRegistry/BenchmarkRegistry/ToolRegistry. */
export class CollectorRegistry {
  private collectors = new Map<string, Collector>();

  register(collector: Collector): void {
    this.collectors.set(collector.id, collector);
  }

  get(id: string): Collector | undefined {
    return this.collectors.get(id);
  }

  list(): Collector[] {
    return [...this.collectors.values()];
  }

  byDomain(domain: IntelligenceDomain): Collector[] {
    return this.list().filter((c) => c.domain === domain);
  }
}
