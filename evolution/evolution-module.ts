import type { Kernel } from "../kernel/kernel";
import type { ProviderRegistry } from "../providers/registry";
import type { Scheduler } from "../scheduler/scheduler";
import { MutationRegistry } from "./mutation/registry";
import { promptRewriteMutation } from "./mutation/mutations/prompt-rewrite";
import { temperatureMutation } from "./mutation/mutations/temperature";
import { retryCountMutation } from "./mutation/mutations/retry-count";
import { workflowReorderMutation } from "./mutation/mutations/workflow-reorder";
import { BenchmarkRegistry } from "./benchmark/registry";
import { codeGenerationBenchmark } from "./benchmark/benchmarks/code-generation";
import { reasoningPlanningBenchmark } from "./benchmark/benchmarks/reasoning";
import { ExperimentStore } from "./history/experiment-store";
import { GitWorkspaceManager } from "./storage/git-workspace";
import { SubprocessWorkspaceExecutor } from "./engine/subprocess-workspace-executor";
import { Observer } from "./engine/observer";
import { Researcher } from "./engine/researcher";
import { Evaluator } from "./evaluation/evaluator";
import { EvolutionEngine } from "./engine/evolution-engine";
import { EvolutionScheduler } from "./scheduler/evolution-scheduler";

export interface EvolutionModuleOptions {
  kernel: Kernel;
  providers: ProviderRegistry;
  scheduler: Scheduler;
}

/**
 * Wires every evolution/* piece together with AshOS's built-in mutations
 * and benchmarks pre-registered, mirroring how `AshOS` itself pre-registers
 * default tools/agents (see sdk/ashos.ts). Everything stays swappable:
 * register more mutations/benchmarks via `.mutations` / `.benchmarks`, or
 * change the research provider via `config.evolution.researchProvider` —
 * nothing here references LM Studio or Gemma by name.
 */
export class EvolutionModule {
  readonly mutations = new MutationRegistry();
  readonly benchmarks = new BenchmarkRegistry();
  readonly history: ExperimentStore;
  readonly gitWorkspace: GitWorkspaceManager;
  readonly engine: EvolutionEngine;
  readonly scheduler: EvolutionScheduler;

  constructor(private readonly options: EvolutionModuleOptions) {
    this.mutations.register(promptRewriteMutation);
    this.mutations.register(temperatureMutation);
    this.mutations.register(retryCountMutation);
    this.mutations.register(workflowReorderMutation);

    this.benchmarks.register(codeGenerationBenchmark);
    this.benchmarks.register(reasoningPlanningBenchmark);

    this.history = new ExperimentStore(options.kernel.root);
    this.gitWorkspace = new GitWorkspaceManager({ repoRoot: options.kernel.root });

    const observer = new Observer({
      eventBus: options.kernel.eventBus,
      providers: options.providers,
      mutations: this.mutations,
      benchmarks: this.benchmarks,
      history: this.history
    });

    this.engine = new EvolutionEngine({
      observer,
      researcher: this.buildResearcher(),
      mutations: this.mutations,
      benchmarks: this.benchmarks,
      gitWorkspace: this.gitWorkspace,
      executor: new SubprocessWorkspaceExecutor(options.kernel.root),
      evaluator: new Evaluator(),
      history: this.history,
      config: options.kernel.config.evolution,
      eventBus: options.kernel.eventBus
    });

    this.scheduler = new EvolutionScheduler(options.scheduler, this.engine);
  }

  private buildResearcher(): Researcher {
    const provider = this.options.providers.get(this.options.kernel.config.evolution.researchProvider);
    return new Researcher(provider);
  }
}
