# Evolution Engine

The Evolution Engine is AshOS's self-improvement subsystem: it observes the
running system, asks an LLM to propose one small, targeted improvement,
carries that improvement out as a reversible mutation in an isolated git
worktree, builds and tests the result, benchmarks it, and accepts or rejects
it against the current baseline — all without ever touching your working
directory or the `main`/base branch.

It's architecturally inspired by the "AI researcher proposes and tests its
own improvements" loop popularized by projects like Karpathy's AutoResearch,
adapted to fit AshOS's existing conventions: everything is a registry
(`MutationRegistry`, `BenchmarkRegistry`, same shape as `ToolRegistry`/
`AgentRegistry`), everything is provider-agnostic (the "research provider"
is just another entry in `ProviderRegistry`), and everything is
plugin-extensible (`host.evolution.mutations`/`host.evolution.benchmarks`
in `kernel/types.ts`'s `PluginHost`). No code from any external project was
copied — this is an original implementation of the same idea against
AshOS's own primitives.

## Quick start

```bash
ash evolve mutations              # list what can be mutated
ash evolve benchmarks             # list what gets measured
ash evolve run --max 1            # run one experiment
ash evolve list                   # see the result
ash evolve show <experiment-id>   # full detail: hypothesis, metrics, logs
```

Or via the dashboard's **Evolution** tab (status, run button, leaderboard,
latency trend, timeline), or the REST API (`docs/api.md`).

## LLM configuration (LM Studio + Gemma, by default)

The Evolution Engine's "research provider" — the model that reads the
system snapshot and proposes a hypothesis — is configured exactly like any
other AshOS provider, because it *is* one: `providers/lmstudio-provider.ts`
is a thin, OpenAI-compatible client (LM Studio's own docs recommend
`OPENAI_BASE_URL=http://localhost:1234/v1`, `OPENAI_API_KEY=lm-studio`),
registered in `ProviderRegistry` as `"lmstudio"` alongside anthropic/openai/
ollama/mock.

```json
// .ashos/config.json
{
  "providers": {
    "lmstudio": {
      "baseUrl": "http://localhost:1234/v1",
      "apiKey": "lm-studio",
      "model": "google/gemma-4-12b-qat"
    }
  },
  "evolution": {
    "researchProvider": "lmstudio",
    "researchModel": "google/gemma-4-12b-qat",
    "maxExperiments": 20,
    "parallelExperiments": 2,
    "benchmarkTimeout": 300,
    "autoMerge": false,
    "requireTests": true
  }
}
```

Or via environment variables (`.env`):

```bash
LMSTUDIO_BASE_URL=http://localhost:1234/v1
LMSTUDIO_API_KEY=lm-studio
LMSTUDIO_MODEL=google/gemma-4-12b-qat
ASHOS_RESEARCH_PROVIDER=lmstudio
ASHOS_RESEARCH_MODEL=google/gemma-4-12b-qat
```

**The model name is never hardcoded anywhere in the engine.** `Researcher`,
`EvolutionModule`, and every mutation/benchmark reference
`config.evolution.researchModel`/`researchProvider` (or the active
provider's own config), so switching to `qwen2.5-coder` or any other model
LM Studio can serve is a one-line config change — same pattern as switching
AshOS's main provider.

### Setting up LM Studio (Windows, RTX 5060 Ti 16GB, 32GB RAM)

1. Install LM Studio, download `google/gemma-4-12b-qat` (or your model of
   choice — a ~12B Q4-class model is a comfortable fit for a 16GB GPU).
2. Start LM Studio's local server (defaults to `http://localhost:1234`).
3. `ash provider set lmstudio` (or leave `evolution.researchProvider` as
   `lmstudio` and keep your main `provider` as whatever you use day-to-day
   — they're independent settings).
4. `ash doctor` to confirm connectivity.

### Future providers

Because the research provider is resolved through the same
`ProviderRegistry` as everything else, Claude/OpenAI/Gemini/DeepSeek/Qwen/
Ollama all work as research providers with **zero changes to the Evolution
Engine** — Anthropic and OpenAI providers already exist; add the rest the
same way (`docs/provider-guide.md`) and point `researchProvider` at them.

## The evolution loop

```
Observe current system
        │
Generate hypothesis  (Researcher, via the research provider)
        │
Modify prompt/workflow/agent  (a registered Mutation, in an isolated git worktree)
        │
Run benchmark  (build → test → execute → score)
        │
Collect metrics
        │
Compare baseline  (Evaluator)
        │
Accept or Reject
        │
Store history
        │
Repeat
```

Implemented as `EvolutionEngine.runExperiment()` (one full pass) and
`.runCycle()` (repeats `runExperiment()` up to `maxExperiments`, bounded by
`parallelExperiments` concurrent runs at a time) in
`evolution/engine/evolution-engine.ts`. Every stage is an injected
collaborator — `Observer`, `Researcher`, `MutationRegistry`,
`GitWorkspaceManager`, `WorkspaceExecutor`, `Evaluator`, `ExperimentStore`
— so the orchestration logic itself is unit-tested with fakes
(`evolution-engine.test.ts`) while the real subprocess/git mechanics are
tested separately against real processes and real throwaway git repos
(`subprocess-workspace-executor.test.ts`, `git-workspace.test.ts`) —
**never against the live AshOS repo's working directory.**

## What can evolve

`MutationTargetKind` (`evolution/engine/types.ts`) enumerates the surface:
prompt, workflow, agent, planner, provider-routing, tool-selection,
memory-ranking, retry-logic, temperature, context-size, reasoning-strategy.
Four ship built-in, registered by `EvolutionModule`:

| Mutation | Target | What it does |
|---|---|---|
| `prompt-rewrite` | prompt | Replaces an agent's system prompt string (default target: `GenericAgent`) |
| `temperature-adjust` | temperature | Adds an explicit sampling temperature to an agent's `chat()` call |
| `retry-count-adjust` | retry-logic | Changes `TaskExecutor`'s default per-task retry count |
| `workflow-reorder` | workflow | Reverses step order in a workflow JSON definition (dependency correctness is unaffected — the DAG executor schedules by `dependsOn`, not array order) |

A fifth, `comment-strip` (context-size), ships as a **reference plugin**
under `evolution/plugins/evolution-extras/` rather than built-in, to
demonstrate the extension path — see below.

**Every mutation is reversible by construction.** All four (and the plugin
example) go through `evolution/mutation/file-patch.ts`'s
snapshot-then-write pattern: before touching a file, capture its exact
original content (or note that it didn't exist); `revert()` restores that
exact content (or deletes the file). This is verified directly in tests —
apply, assert the change, revert, assert byte-for-byte equality with the
original.

### Adding a mutation

Implement the `Mutation` interface (`evolution/mutation/types.ts`) and
register it — either built-in (`EvolutionModule`) or via a plugin
(`host.evolution.mutations.register(...)`, see
`docs/plugin-development.md`). No engine code changes needed.

## Benchmark framework

Each `Benchmark` (`evolution/benchmark/types.ts`) is one input + a scoring
function + a timeout + metadata — deliberately one scenario, not a suite;
register several for a category rather than growing one benchmark. Two
ship built-in (`code-generation`, `reasoning`); a third
(`documentation-summary`) ships as the reference plugin example. Categories
cover the full list from the spec (`BenchmarkCategory` in
`evolution/benchmark/types.ts`): code-generation, bug-fixing,
documentation, github-research, reasoning, planning, workflow-execution,
prompt-quality, api-generation, video-script-generation — only
code-generation, reasoning, and documentation have real implementations
today; the rest are typed and ready for the same pattern.

```ts
// Example benchmark (evolution/benchmark/benchmarks/code-generation.ts)
export const codeGenerationBenchmark: Benchmark = {
  id: "code-gen-is-palindrome",
  category: "code-generation",
  description: "Write a TypeScript isPalindrome(s: string): boolean function",
  input: "Write a TypeScript function named isPalindrome...",
  timeoutMs: 30_000,
  score(actualOutput) {
    // heuristic signal check — see the file for the full pattern list
  }
};
```

`BenchmarkRunner` (used for direct, in-process runs — e.g. `ash evolve
benchmark`-style tooling or tests) calls `context.provider.chat()`
directly. **Inside an actual experiment**, benchmarks instead run through
`WorkspaceExecutor.execute()`, which spawns the *mutated, built workspace's
own* `ash evolve exec --input <text>` CLI command as a subprocess and reads
its output — so a `prompt-rewrite` or `temperature-adjust` mutation's
effect is genuinely exercised (it changes what that subprocess's own
`GenericAgent` does), not just the research provider's opinion of the idea.

## Mutation engine → execution pipeline

```
Create isolated git worktree + branch  (GitWorkspaceManager, never touches main)
        │
Apply mutation (file snapshot + patch, in the worktree only)
        │
Commit
        │
Build   (npm run typecheck, in the worktree)
        │
Test    (npm test, in the worktree — skippable via config.evolution.requireTests)
        │
Benchmark  (spawn the worktree's own `ash evolve exec`, once per benchmark)
        │
Evaluate   (Evaluator: weighted score, compare to baseline)
        │
Accept → merge into `evolution/accepted` (only if autoMerge is true) → rollback the experiment branch
Reject → rollback (worktree + branch removed)
```

**Git isolation, concretely** (`evolution/storage/git-workspace.ts`): each
experiment gets its own `git worktree` (not a full clone — same isolation,
a fraction of the cost, since worktrees share the repo's object store) on a
branch named `evolution/exp-<id>`. `GitWorkspaceManager` hard-refuses to
merge into or otherwise touch `main`, `master`, or the resolved base
branch — this is enforced in code
(`assertNotProtected`), not just convention, and is covered by tests that
assert the base branch's file content is byte-identical before and after
every experiment, accepted or rejected. Accepted experiments (only when
`autoMerge: true`) merge into a dedicated `evolution/accepted` integration
branch for a human to review and cherry-pick/PR into `main` — accepted
work **never** lands on `main` automatically, by design, per the
`autoMerge: false` default and the hard branch guard either way.

**Dependency reuse, not reinstall**: worktrees share git history but not
`node_modules` (gitignored). Reinstalling per experiment would be slow and
network-dependent; instead `SubprocessWorkspaceExecutor` symlinks
`node_modules` from the source repo into each worktree
(`linkNodeModules()`). Safe because none of the built-in mutations touch
`package.json`.

## Metrics & evaluation

`ExperimentMetrics` (`evolution/evaluation/types.ts`): latency, token usage
(when a provider reports it), execution time, process memory (always),
GPU utilization (best-effort via `nvidia-smi`, `undefined` when
unavailable — never assumed), tool calls, success/failure rate,
compilation success, tests passed/failed, aggregate benchmark score, and a
computed `weightedOverallScore`.

`Evaluator` (`evolution/evaluation/evaluator.ts`) is pure, dependency-free
logic:

- `computeWeightedScore()` combines benchmark score, latency (inverted,
  capped at a configurable max), success rate, and token efficiency
  (inverted, capped) via configurable weights (`DEFAULT_EVALUATION_WEIGHTS`).
- `compare(baseline, candidate, requireTests)` is the accept/reject
  decision: a failed build or (when `requireTests` is set) any failing
  test is an automatic reject *regardless of score* — a regression never
  gets accepted because latency improved. Otherwise, accept only if the
  candidate beats baseline by at least `minImprovement` (default `0.01`),
  so noise-level "improvements" don't spam history with accepts.

The very first experiment ever run has no prior baseline; it's compared
against a neutral, near-zero cold-start baseline so a working first result
is accepted (see `EvolutionEngine.neutralBaseline()`).

## Experiment storage ("database schema")

No SQL database — one JSON file per experiment under
`.ashos/evolution/experiments/<id>.json`, the same local-first pattern
`MemoryManager` and `PermissionManager` already use. `ExperimentRecord`
(`evolution/history/types.ts`) is the schema:

| Field | Type | Notes |
|---|---|---|
| `id`, `createdAt`, `finishedAt`, `status` | string / ISO date / `pending\|running\|completed\|error` | |
| `hypothesis` | `Hypothesis` | summary, filesToModify, implementationPlan, expectedImpact, risks, benchmarkStrategy, mutationId, mutationParams |
| `mutationId`, `mutationParams` | string / object | which registered mutation ran |
| `researchProvider`, `researchModel` | string | what generated the hypothesis |
| `gitBranch`, `gitCommit` | string | where to find the actual diff |
| `metrics` | `ExperimentMetrics?` | see above |
| `benchmarkResults` | `BenchmarkRunResult[]?` | per-benchmark score/latency/output, powers the dashboard's latency trend and leaderboard |
| `decision` | `EvaluationDecision?` | accepted, reason, baselineScore, candidateScore, delta |
| `result`, `reason` | `accepted\|rejected\|error\|pending` / string | |
| `logs` | `string[]` | human-readable step log for `ash evolve show` |

`ExperimentStore` (`evolution/history/experiment-store.ts`) provides
`save`/`get`/`list`/`leaderboard`/`acceptanceRate`/`latestBaseline` over
this file store.

## Resource limits

Tuned for the stated hardware (RTX 5060 Ti 16GB, 32GB RAM, i5-14600K):

- `parallelExperiments` defaults to **2** — two concurrent experiments,
  each spawning its own build/test/benchmark subprocesses, is a reasonable
  ceiling before GPU memory (shared by whatever's loaded in LM Studio) and
  CPU contention start hurting wall-clock time more than parallelism
  helps. Raise or lower via config; the engine enforces the cap via
  bounded batches in `runCycle()`, never launching more than
  `parallelExperiments` at once regardless of `maxExperiments`.
- `benchmarkTimeout` (seconds) bounds build/test/benchmark subprocesses
  individually, so a hung LM Studio request or infinite loop in a mutated
  workspace can't stall a whole cycle.
- GPU utilization is collected best-effort (`evolution/engine/resource-metrics.ts`)
  via `nvidia-smi`; it's simply omitted (not zero, not an error) when
  unavailable, which is the normal case in CI/sandboxes with no GPU.

## Scheduler integration

Recurring cycles reuse the existing kernel `Scheduler` (cron) — no
separate scheduling engine:

```ts
ashos.evolution.scheduler.scheduleCycle({ cron: "0 3 * * *", maxExperiments: 5 });
```

## Dashboard

The **Evolution** tab (`dashboard/src/App.tsx`) shows: live running/idle
status and a one-click "run one experiment" action, history summary
(total/accepted/rejected/errored, acceptance rate), a latency trend across
completed experiments, the top-scoring leaderboard, and a timeline of
recent experiments with their hypothesis/rejection reason. All of it reads
from the REST endpoints below, polling every few seconds — no new
transport, same pattern as the rest of the dashboard.

## REST API

See `docs/api.md` for the full table. Summary: `POST /evolution/run`
(starts a cycle in the background, 202/409), `GET /evolution/status`,
`GET /evolution/experiments[/:id]`, `GET /evolution/leaderboard`,
`GET /evolution/stats`, `GET /evolution/mutations`,
`GET /evolution/benchmarks`, `GET`/`PATCH /evolution/config`.

## CLI

See `docs/cli.md`. Summary: `ash evolve run|status|list|show <id>|mutations|benchmarks`,
plus `ash evolve exec --input <text>` — an internal, script-friendly
command (stable JSON-on-last-line stdout contract) that
`SubprocessWorkspaceExecutor` spawns inside each experiment workspace; not
meant for interactive use.

## Example: a full experiment, end to end

```bash
$ ash evolve run --max 1
Running evolution cycle (research provider: lmstudio)...
  ✔ exp-1732650000123-a1b2c3 — accepted

Completed 1 experiment(s).
✔ exp-1732650000123-a1b2c3 [temperature-adjust] accepted — improved weighted score by Δ0.184

$ ash evolve show exp-1732650000123-a1b2c3
Experiment exp-1732650000123-a1b2c3 — accepted
Branch: evolution/exp-exp-1732650000123-a1b2c3 @ 9f3a1c02

Hypothesis: Lower the temperature on the generic agent to reduce output variance
Implementation plan: Add temperature: 0.3 to the chat() call in agents/generic-agent.ts
Expected impact: More consistent benchmark scores across repeated runs
Risks: Slightly less creative phrasing on open-ended prompts

Metrics: weighted score 0.812, benchmark 0.850, latency 812ms
Build: success  Tests: 166 passed / 0 failed

Log:
  hypothesis: Lower the temperature on the generic agent to reduce output variance
  created workspace on branch evolution/exp-exp-1732650000123-a1b2c3
  applied mutation "temperature-adjust": Patched agents/generic-agent.ts
  build: success
  tests: 166 passed, 0 failed
  accepted but autoMerge is disabled — branch evolution/exp-exp-1732650000123-a1b2c3 left for manual review
```

(Illustrative — the actual hypothesis text depends on what your research
model returns; a real run against `google/gemma-4-12b-qat` in LM Studio
will vary. See `docs/test-report.md`-style verification: this repository's
own test suite includes a version of this exact flow —
`evolution/engine/evolution-engine.test.ts`'s "merges into the integration
branch..." test — run against a real throwaway git repo with a scripted
research response and a fake (but interface-identical) executor, plus a
fully-real-subprocess version in `subprocess-workspace-executor.test.ts`.)

## Safety model, summarized

- Mutations only ever touch files inside an isolated `git worktree` —
  never the live working directory.
- Every mutation is reversible (snapshot-and-restore), verified by tests.
- `main`/`master`/the base branch can never be merged into or targeted by
  rollback — enforced in code (`GitWorkspaceManager.assertNotProtected`),
  not just convention.
- `autoMerge` defaults to `false`; even when enabled, merges land on a
  dedicated `evolution/accepted` branch, never `main`.
- A failed build or (when `requireTests`) a failing test is an automatic
  reject, regardless of benchmark score.
- Nothing here runs unless you invoke `ash evolve run`, hit
  `POST /evolution/run`, or explicitly schedule it — there's no
  auto-start-on-boot behavior.

### Crash recovery: orphaned worktrees

Every normal path (`rejected`, `accepted`+merged) already calls `rollback()`
itself, and a *caught* error also rolls back in `runExperiment`'s `catch`
block. But an unclean shutdown — `kill -9`, an OOM, a host reboot — can land
the process between `createWorkspace` and that cleanup, leaving a git
worktree/branch under `.ashos/evolution/worktrees/<id>` with no
`ExperimentRecord` at all.

`EvolutionEngine.pruneOrphanedExperiments()` sweeps for exactly this: it
lists every worktree still on disk (`GitWorkspaceManager.listWorktreeIds()`,
a plain filesystem read, not a git call) and removes any whose experiment
has no record, or whose record says `rejected`/`error` (meaning `rollback`
should have run but didn't finish). For an ID with no prior record it also
files a synthetic `error` record explaining what happened, so it's visible
in `ash evolve list`/the dashboard timeline instead of silently
disappearing. It deliberately leaves alone the one *intentional* survivor —
an `accepted` experiment with `autoMerge` off, kept on its branch for manual
review.

This runs automatically at two points — `ash evolve run` (before starting a
new cycle) and API server startup (`createServer`) — and is also available
on demand via `ash evolve prune`. It's idempotent and safe to call anytime,
including against a root that isn't a git repo at all (no worktrees
directory means nothing to do).

## What's not implemented (see `docs/roadmap.md`)

- Only 3 of the 10 listed benchmark categories, and 4 (+1 plugin example)
  of the ~11 listed mutation kinds, have real implementations — the rest
  are typed and follow the identical pattern to add.
- Token usage isn't populated yet (`AIProvider` doesn't currently surface
  token counts uniformly across providers); the metric field exists and is
  scored as "unknown = no penalty" until wired up.
- No UI for authoring new mutations/benchmarks (they're TypeScript, added
  the same way tools/agents are) — matches the rest of AshOS at this stage.
