import type { EventBus } from "../../kernel/event-bus";
import type { ProviderRegistry } from "../../providers/registry";
import type { MutationRegistry } from "../mutation/registry";
import type { BenchmarkRegistry } from "../benchmark/registry";
import type { ExperimentStore } from "../history/experiment-store";
import type { SystemSnapshot } from "./types";

export interface ObserverDeps {
  eventBus: EventBus;
  providers: ProviderRegistry;
  mutations: MutationRegistry;
  benchmarks: BenchmarkRegistry;
  history: ExperimentStore;
}

/**
 * "Observe current system": the first stage of the evolution loop. Reads
 * the live kernel event history and past experiment results into a compact
 * snapshot the Researcher can ground its hypothesis in, without giving it
 * raw access to the whole event bus or experiment store.
 */
export class Observer {
  constructor(private readonly deps: ObserverDeps) {}

  snapshot(): SystemSnapshot {
    const recentActivity = this.deps.eventBus
      .getHistory()
      .filter((e) => e.name !== "log")
      .slice(-10)
      .map((e) => `${e.name} ${JSON.stringify(e.payload)}`);

    const recentBenchmarkScores: Record<string, number> = {};
    for (const record of this.deps.history.list()) {
      for (const result of record.benchmarkResults ?? []) {
        if (!(result.benchmarkId in recentBenchmarkScores)) {
          recentBenchmarkScores[result.benchmarkId] = result.score;
        }
      }
    }

    return {
      timestamp: new Date().toISOString(),
      activeProvider: this.deps.providers.active().name(),
      registeredMutations: this.deps.mutations.list().map((m) => m.id),
      registeredBenchmarks: this.deps.benchmarks.list().map((b) => b.id),
      recentBenchmarkScores,
      recentActivity
    };
  }
}
