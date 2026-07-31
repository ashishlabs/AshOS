import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EvolutionEngine } from "./evolution-engine";
import { Observer } from "./observer";
import { Researcher } from "./researcher";
import type { WorkspaceExecutor, BuildResult, TestResult } from "./workspace-executor";
import { GitWorkspaceManager } from "../storage/git-workspace";
import { Evaluator } from "../evaluation/evaluator";
import { ExperimentStore } from "../history/experiment-store";
import { MutationRegistry } from "../mutation/registry";
import { BenchmarkRegistry } from "../benchmark/registry";
import { promptRewriteMutation } from "../mutation/mutations/prompt-rewrite";
import { temperatureMutation } from "../mutation/mutations/temperature";
import { codeGenerationBenchmark } from "../benchmark/benchmarks/code-generation";
import { reasoningPlanningBenchmark } from "../benchmark/benchmarks/reasoning";
import { EventBus } from "../../kernel/event-bus";
import { ProviderRegistry } from "../../providers/registry";
import { MockProvider } from "../../providers/mock-provider";
import { defaultConfig } from "../../kernel/config";
import type { AIProvider, ChatMessage, ChatOptions, ChatResult } from "../../providers/types";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(__dirname, "../..");

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args]);
  return stdout.trim();
}

async function makeSeededRepo(): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-evo-engine-"));
  await git(dir, ["init", "-b", "main"]);
  await git(dir, ["config", "user.email", "test@example.com"]);
  await git(dir, ["config", "user.name", "Test"]);
  await git(dir, ["config", "commit.gpgsign", "false"]);
  for (const rel of ["agents/generic-agent.ts", "planner/executor.ts", "examples/workflows/research-and-build.json"]) {
    const dest = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, rel), dest);
  }
  await git(dir, ["add", "-A"]);
  await git(dir, ["commit", "-m", "seed"]);
  return dir;
}

class ScriptedProvider extends MockProvider implements AIProvider {
  constructor(private response: string) {
    super();
  }
  async chat(_messages: ChatMessage[], _options?: ChatOptions): Promise<ChatResult> {
    return { content: this.response };
  }
}

class FakeExecutor implements WorkspaceExecutor {
  callCount = 0;
  constructor(
    private readonly outputs: string[] = ["great output"],
    private readonly buildResult: BuildResult = { success: true, log: "" },
    private readonly testResult: TestResult = { passed: 5, failed: 0, log: "" }
  ) {}

  async build(): Promise<BuildResult> {
    return this.buildResult;
  }
  async test(): Promise<TestResult> {
    return this.testResult;
  }
  async execute(): Promise<string> {
    const output = this.outputs[this.callCount] ?? this.outputs[this.outputs.length - 1];
    this.callCount++;
    return output;
  }
}

function temperatureHypothesisResponse(temperature = 0.5): string {
  return JSON.stringify({
    summary: "Adjust temperature for more consistent output",
    filesToModify: ["agents/generic-agent.ts"],
    implementationPlan: "Add an explicit temperature to the generic agent's chat call",
    expectedImpact: "More consistent benchmark scores",
    risks: "Low",
    benchmarkStrategy: "Run all registered benchmarks",
    mutationId: "temperature-adjust",
    mutationParams: { temperature }
  });
}

function buildEngine(repoRoot: string, opts: { executor?: WorkspaceExecutor; configOverrides?: Partial<ReturnType<typeof defaultConfig>["evolution"]>; researchResponse?: string; eventBus?: EventBus } = {}) {
  const eventBus = opts.eventBus ?? new EventBus();
  const mutations = new MutationRegistry();
  mutations.register(promptRewriteMutation);
  mutations.register(temperatureMutation);

  const benchmarks = new BenchmarkRegistry();
  benchmarks.register(codeGenerationBenchmark);
  benchmarks.register(reasoningPlanningBenchmark);

  const history = new ExperimentStore(repoRoot);
  const gitWorkspace = new GitWorkspaceManager({ repoRoot });
  const observer = new Observer({ eventBus, providers: new ProviderRegistry(defaultConfig()), mutations, benchmarks, history });
  const researcher = new Researcher(new ScriptedProvider(opts.researchResponse ?? temperatureHypothesisResponse()));
  const evaluator = new Evaluator();
  const config = { ...defaultConfig().evolution, ...opts.configOverrides };

  const engine = new EvolutionEngine({
    observer,
    researcher,
    mutations,
    benchmarks,
    gitWorkspace,
    executor: opts.executor ?? new FakeExecutor(),
    evaluator,
    history,
    config,
    eventBus
  });

  return { engine, history, gitWorkspace, eventBus };
}

describe("EvolutionEngine", () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await makeSeededRepo();
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  it("runs a full experiment end to end and accepts a promising first result against the cold-start baseline", async () => {
    const { engine, history } = buildEngine(repoRoot, {
      executor: new FakeExecutor(["function isPalindrome(s: string): boolean { return s.toLowerCase().replace(/x/, '') === s.split('').reverse().join(''); }"])
    });

    const record = await engine.runExperiment();

    expect(record.status).toBe("completed");
    expect(record.result).toBe("accepted");
    expect(record.metrics?.compilationSuccess).toBe(true);
    expect(record.metrics?.testsPassed).toBe(5);
    expect(record.benchmarkResults).toHaveLength(2);
    expect(history.get(record.id)?.id).toBe(record.id);

    const branches = await git(repoRoot, ["branch", "--list", record.gitBranch]);
    expect(branches).not.toBe("");
  });

  it("rejects and rolls back when the workspace fails to build, and never runs benchmarks against a broken build", async () => {
    const { engine } = buildEngine(repoRoot, {
      executor: new FakeExecutor(["irrelevant"], { success: false, log: "type error" })
    });

    const record = await engine.runExperiment();

    expect(record.result).toBe("rejected");
    expect(record.metrics?.compilationSuccess).toBe(false);
    expect(record.benchmarkResults).toEqual([]);

    const branches = await git(repoRoot, ["branch", "--list", record.gitBranch]);
    expect(branches).toBe("");
  });

  it("rejects and rolls back when required tests fail, even if benchmarks score well", async () => {
    const { engine } = buildEngine(repoRoot, {
      executor: new FakeExecutor(
        ["function isPalindrome(s: string): boolean { return s.toLowerCase().replace(/x/, '') === s.split('').reverse().join(''); }"],
        { success: true, log: "" },
        { passed: 3, failed: 2, log: "" }
      )
    });

    const record = await engine.runExperiment();

    expect(record.result).toBe("rejected");
    expect(record.decision?.reason).toMatch(/failing test/);
  });

  it("produces an error record instead of throwing when no mutations are registered", async () => {
    const eventBus = new EventBus();
    const history = new ExperimentStore(repoRoot);
    const mutations = new MutationRegistry(); // deliberately empty
    const benchmarks = new BenchmarkRegistry();
    const observer = new Observer({ eventBus, providers: new ProviderRegistry(defaultConfig()), mutations, benchmarks, history });
    const researcher = new Researcher(new ScriptedProvider("{}"));

    const engine = new EvolutionEngine({
      observer,
      researcher,
      mutations,
      benchmarks,
      gitWorkspace: new GitWorkspaceManager({ repoRoot }),
      executor: new FakeExecutor(),
      evaluator: new Evaluator(),
      history,
      config: defaultConfig().evolution,
      eventBus
    });

    const record = await engine.runExperiment();
    expect(record.status).toBe("error");
    expect(record.result).toBe("error");
    expect(record.reason).toMatch(/no mutations are registered/);
  });

  it("merges into the integration branch and cleans up the experiment branch when autoMerge is enabled", async () => {
    const { engine } = buildEngine(repoRoot, {
      configOverrides: { autoMerge: true },
      executor: new FakeExecutor(["function isPalindrome(s: string): boolean { return s.toLowerCase().replace(/x/, '') === s.split('').reverse().join(''); }"])
    });

    const record = await engine.runExperiment();
    expect(record.result).toBe("accepted");

    const experimentBranch = await git(repoRoot, ["branch", "--list", record.gitBranch]);
    expect(experimentBranch).toBe("");

    const integrationContent = await git(repoRoot, ["show", "evolution/accepted:agents/generic-agent.ts"]);
    expect(integrationContent).toContain("temperature: 0.5");
  });

  it("pruneOrphanedExperiments removes a leftover worktree with no record and files an error record for it", async () => {
    const { engine, history, gitWorkspace, eventBus } = buildEngine(repoRoot);

    // Simulate a hard crash: a worktree/branch was created directly (bypassing
    // runExperiment's try/catch entirely) and never rolled back or recorded.
    const orphan = await gitWorkspace.createWorkspace("exp-crashed");
    expect(history.get("exp-crashed")).toBeUndefined();

    const pruned = await engine.pruneOrphanedExperiments();

    expect(pruned).toEqual(["exp-crashed"]);
    expect(fs.existsSync(orphan.worktreePath)).toBe(false);
    const branches = await git(repoRoot, ["branch", "--list", orphan.branch]);
    expect(branches).toBe("");

    const record = history.get("exp-crashed");
    expect(record?.result).toBe("error");
    expect(record?.reason).toMatch(/orphaned worktree pruned on startup/);

    const eventNames = eventBus.getHistory().map((e) => e.name);
    expect(eventNames).toContain("evolution:experiment-pruned");
  });

  it("pruneOrphanedExperiments leaves an accepted experiment's worktree alone (kept for manual review)", async () => {
    const { engine, gitWorkspace } = buildEngine(repoRoot, {
      configOverrides: { autoMerge: false },
      executor: new FakeExecutor(["function isPalindrome(s: string): boolean { return s.toLowerCase().replace(/x/, '') === s.split('').reverse().join(''); }"])
    });

    const record = await engine.runExperiment();
    expect(record.result).toBe("accepted");
    expect(gitWorkspace.listWorktreeIds()).toContain(record.id);

    const pruned = await engine.pruneOrphanedExperiments();

    expect(pruned).toEqual([]);
    expect(gitWorkspace.listWorktreeIds()).toContain(record.id);
  });

  it("pruneOrphanedExperiments cleans up a rejected experiment's worktree if rollback silently failed to remove it", async () => {
    const { engine, history, gitWorkspace } = buildEngine(repoRoot, {
      executor: new FakeExecutor(["irrelevant"], { success: false, log: "type error" })
    });

    const record = await engine.runExperiment();
    expect(record.result).toBe("rejected");
    expect(gitWorkspace.listWorktreeIds()).not.toContain(record.id); // rollback already ran normally

    // Recreate the same worktree out-of-band to simulate rollback having failed to fully clean up.
    await gitWorkspace.createWorkspace(record.id);
    expect(gitWorkspace.listWorktreeIds()).toContain(record.id);

    const pruned = await engine.pruneOrphanedExperiments();

    expect(pruned).toContain(record.id);
    expect(gitWorkspace.listWorktreeIds()).not.toContain(record.id);
    expect(history.get(record.id)?.result).toBe("rejected"); // existing record is untouched, not overwritten
  });

  it("runCycle runs the configured number of experiments in bounded-parallel batches and emits lifecycle events", async () => {
    const eventBus = new EventBus();
    const { engine } = buildEngine(repoRoot, {
      eventBus,
      configOverrides: { maxExperiments: 3, parallelExperiments: 2 },
      executor: new FakeExecutor(["ok"])
    });

    const records = await engine.runCycle();

    expect(records).toHaveLength(3);
    expect(new Set(records.map((r) => r.id)).size).toBe(3);

    const eventNames = eventBus.getHistory().map((e) => e.name);
    expect(eventNames).toContain("evolution:cycle-started");
    expect(eventNames).toContain("evolution:cycle-finished");
    expect(eventNames.filter((n) => n === "evolution:experiment-started")).toHaveLength(3);
  });
});
