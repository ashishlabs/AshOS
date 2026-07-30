import type { EventBus } from "../../kernel/event-bus";
import type { EvolutionConfig } from "../../kernel/config";
import type { MutationRegistry } from "../mutation/registry";
import type { BenchmarkRegistry } from "../benchmark/registry";
import type { Benchmark, BenchmarkRunResult } from "../benchmark/types";
import type { GitWorkspaceManager, ExperimentWorkspace } from "../storage/git-workspace";
import type { Evaluator } from "../evaluation/evaluator";
import type { ExperimentMetrics } from "../evaluation/types";
import type { ExperimentStore } from "../history/experiment-store";
import type { ExperimentRecord, ExperimentOutcome } from "../history/types";
import type { Observer } from "./observer";
import type { Researcher } from "./researcher";
import type { BuildResult, TestResult, WorkspaceExecutor } from "./workspace-executor";
import { collectResourceMetrics } from "./resource-metrics";
import type { EvolutionCycleOptions, Hypothesis } from "./types";

export interface EvolutionEngineDeps {
  observer: Observer;
  researcher: Researcher;
  mutations: MutationRegistry;
  benchmarks: BenchmarkRegistry;
  gitWorkspace: GitWorkspaceManager;
  executor: WorkspaceExecutor;
  evaluator: Evaluator;
  history: ExperimentStore;
  config: EvolutionConfig;
  eventBus?: EventBus;
}

const INTEGRATION_BRANCH = "evolution/accepted";
const PASS_THRESHOLD = 0.6;

/**
 * The full loop: Observe -> Hypothesis -> Mutate -> Build -> Test ->
 * Benchmark -> Evaluate -> Accept/Reject -> Store -> (Merge | Rollback).
 * Every stage is an injected collaborator so this class contains only
 * orchestration — no git/subprocess/LLM mechanics of its own.
 */
export class EvolutionEngine {
  constructor(private readonly deps: EvolutionEngineDeps) {}

  async runExperiment(options: { benchmarkIds?: string[] } = {}): Promise<ExperimentRecord> {
    const id = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    const logs: string[] = [];
    let workspace: ExperimentWorkspace | undefined;

    this.deps.eventBus?.emit("evolution:experiment-started", { id });

    try {
      const snapshot = this.deps.observer.snapshot();
      const mutationsList = this.deps.mutations.list();
      const hypothesis = await this.deps.researcher.propose(snapshot, mutationsList);
      logs.push(`hypothesis: ${hypothesis.summary}`);

      const mutation = this.deps.mutations.get(hypothesis.mutationId);
      if (!mutation) throw new Error(`no mutation registered with id "${hypothesis.mutationId}"`);

      workspace = await this.deps.gitWorkspace.createWorkspace(id);
      logs.push(`created workspace on branch ${workspace.branch}`);

      const applied = await mutation.apply({ workspaceRoot: workspace.worktreePath }, hypothesis.mutationParams);
      logs.push(`applied mutation "${mutation.id}": ${applied.summary}`);

      const commitSha = await this.deps.gitWorkspace.commit(workspace, `evolution(${mutation.id}): ${hypothesis.summary}`);

      const timeoutMs = this.deps.config.benchmarkTimeout * 1000;
      const build = await this.deps.executor.build(workspace.worktreePath, timeoutMs);
      logs.push(`build: ${build.success ? "success" : "FAILED"}`);

      const tests = this.deps.config.requireTests
        ? await this.deps.executor.test(workspace.worktreePath, timeoutMs)
        : { passed: 0, failed: 0, log: "" };
      if (this.deps.config.requireTests) logs.push(`tests: ${tests.passed} passed, ${tests.failed} failed`);

      const benchmarksToRun = this.resolveBenchmarks(options.benchmarkIds);
      const benchmarkResults = build.success ? await this.runBenchmarks(workspace, benchmarksToRun, timeoutMs) : [];
      const resources = await collectResourceMetrics();

      const metrics = this.deps.evaluator.finalize({ ...this.aggregateMetrics(build, tests, benchmarkResults), ...resources });
      const baseline = this.deps.history.latestBaseline()?.metrics ?? this.neutralBaseline();
      const decision = this.deps.evaluator.compare(baseline, metrics, this.deps.config.requireTests);

      const result = await this.settle(workspace, decision.accepted, logs);

      const record: ExperimentRecord = {
        id,
        createdAt,
        finishedAt: new Date().toISOString(),
        status: "completed",
        hypothesis,
        mutationId: mutation.id,
        mutationParams: hypothesis.mutationParams,
        researchProvider: this.deps.config.researchProvider,
        researchModel: this.deps.config.researchModel,
        gitBranch: workspace.branch,
        gitCommit: commitSha,
        metrics,
        benchmarkResults,
        decision,
        result,
        reason: decision.reason,
        logs
      };
      this.deps.history.save(record);
      this.deps.eventBus?.emit("evolution:experiment-finished", { id, result });
      return record;
    } catch (error) {
      const message = (error as Error).message;
      logs.push(`error: ${message}`);
      if (workspace) await this.deps.gitWorkspace.rollback(workspace).catch(() => {});

      const record: ExperimentRecord = {
        id,
        createdAt,
        finishedAt: new Date().toISOString(),
        status: "error",
        hypothesis: this.emptyHypothesis(),
        mutationId: "",
        researchProvider: this.deps.config.researchProvider,
        researchModel: this.deps.config.researchModel,
        gitBranch: workspace?.branch ?? "",
        result: "error",
        reason: message,
        logs
      };
      this.deps.history.save(record);
      this.deps.eventBus?.emit("evolution:experiment-failed", { id, error: message });
      return record;
    }
  }

  async runCycle(options: EvolutionCycleOptions = {}): Promise<ExperimentRecord[]> {
    const max = options.maxExperiments ?? this.deps.config.maxExperiments;
    const parallel = Math.max(1, options.parallelExperiments ?? this.deps.config.parallelExperiments);
    const results: ExperimentRecord[] = [];

    this.deps.eventBus?.emit("evolution:cycle-started", { maxExperiments: max, parallelExperiments: parallel });
    let remaining = max;
    while (remaining > 0) {
      const batchSize = Math.min(parallel, remaining);
      const batch = await Promise.all(
        Array.from({ length: batchSize }, () => this.runExperiment({ benchmarkIds: options.benchmarkIds }))
      );
      results.push(...batch);
      remaining -= batchSize;
    }
    this.deps.eventBus?.emit("evolution:cycle-finished", { count: results.length });
    return results;
  }

  /** Merges (if accepted + autoMerge) or rolls back (if rejected) the workspace, returning the final outcome. */
  private async settle(workspace: ExperimentWorkspace, accepted: boolean, logs: string[]): Promise<ExperimentOutcome> {
    if (!accepted) {
      await this.deps.gitWorkspace.rollback(workspace);
      logs.push(`rejected — rolled back branch ${workspace.branch}`);
      return "rejected";
    }
    if (this.deps.config.autoMerge) {
      await this.deps.gitWorkspace.mergeToIntegrationBranch(workspace, INTEGRATION_BRANCH);
      logs.push(`accepted — merged into ${INTEGRATION_BRANCH}`);
      await this.deps.gitWorkspace.rollback(workspace);
    } else {
      logs.push(`accepted but autoMerge is disabled — branch ${workspace.branch} left for manual review`);
    }
    return "accepted";
  }

  private resolveBenchmarks(ids?: string[]): Benchmark[] {
    if (!ids) return this.deps.benchmarks.list();
    return ids.map((id) => this.deps.benchmarks.get(id)).filter((b): b is Benchmark => Boolean(b));
  }

  private async runBenchmarks(workspace: ExperimentWorkspace, benchmarks: Benchmark[], timeoutMs: number): Promise<BenchmarkRunResult[]> {
    const results: BenchmarkRunResult[] = [];
    for (const benchmark of benchmarks) {
      const start = performance.now();
      try {
        const output = await this.deps.executor.execute(workspace.worktreePath, benchmark.input, Math.min(benchmark.timeoutMs, timeoutMs));
        const score = await benchmark.score(output);
        results.push({
          benchmarkId: benchmark.id,
          category: benchmark.category,
          score,
          passed: score >= PASS_THRESHOLD,
          latencyMs: performance.now() - start,
          output
        });
      } catch (error) {
        results.push({
          benchmarkId: benchmark.id,
          category: benchmark.category,
          score: 0,
          passed: false,
          latencyMs: performance.now() - start,
          output: "",
          error: (error as Error).message
        });
      }
    }
    return results;
  }

  private aggregateMetrics(build: BuildResult, tests: TestResult, results: BenchmarkRunResult[]): Omit<ExperimentMetrics, "weightedOverallScore"> {
    const avgScore = results.length ? results.reduce((sum, r) => sum + r.score, 0) / results.length : 0;
    const avgLatency = results.length ? results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length : 0;
    const successCount = results.filter((r) => r.passed).length;

    return {
      latencyMs: avgLatency,
      executionTimeMs: avgLatency,
      toolCalls: 0,
      successRate: results.length ? successCount / results.length : 0,
      failureRate: results.length ? 1 - successCount / results.length : 1,
      compilationSuccess: build.success,
      testsPassed: tests.passed,
      testsFailed: tests.failed,
      benchmarkScore: avgScore
    };
  }

  /** Cold-start baseline used when no prior experiment exists to compare against. */
  private neutralBaseline(): ExperimentMetrics {
    return this.deps.evaluator.finalize({
      latencyMs: 0,
      executionTimeMs: 0,
      toolCalls: 0,
      successRate: 0,
      failureRate: 1,
      compilationSuccess: true,
      benchmarkScore: 0
    });
  }

  private emptyHypothesis(): Hypothesis {
    return {
      summary: "n/a — experiment failed before a hypothesis could be evaluated",
      filesToModify: [],
      implementationPlan: "",
      expectedImpact: "",
      risks: "",
      benchmarkStrategy: "",
      mutationId: ""
    };
  }
}
