# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                 # install root deps (and dashboard/ via workspaces)
npm run typecheck           # tsc --noEmit — run before considering any change done
npm test                    # vitest run — all unit/integration tests, once
npm run test:watch          # vitest watch mode
npm run test:coverage       # vitest run --coverage (v8 provider)
npm run build               # tsc -p tsconfig.json -> dist/
npm run cli -- <args>       # run the `ash` CLI from source via tsx, e.g. npm run cli -- status
npm run api                 # start the REST API (tsx api/server.ts) on :4700
npm run dashboard:dev       # Vite dev server on :5173, proxies /api -> :4700
npm run dashboard:build     # build the dashboard workspace
```

Run a single test file: `npx vitest run kernel/dag.test.ts`
Run a single test by name: `npx vitest run -t "retries failing nodes"`

Tests are colocated as `*.test.ts` next to their source file (e.g.
`kernel/dag.ts` + `kernel/dag.test.ts`). `vitest.config.ts` has an explicit
`include` list per top-level package — when adding a new package directory
with tests, add its glob there or the tests won't run.

There is no separate lint script; `npm run typecheck` (strict TS) is the
quality gate. CI (`.github/workflows/ci.yml`) runs `typecheck` then
`test:coverage` on Node 22.

The `dashboard/` package is its own npm workspace with its own
`tsconfig.json` (ESM/Vite, DOM lib) — it is excluded from the root
`tsconfig.json` and from `vitest.config.ts`. Don't try to import root
packages (`kernel/`, `sdk/`, etc.) into `dashboard/`; it only talks to the
system over the REST API (`dashboard/src/api.ts`).

## Architecture

AshOS is a single TypeScript package (not per-package npm workspaces) whose
top-level directories map directly to the subsystems in `docs/architecture.md`.
There is one `tsconfig.json` / one `vitest.config.ts` for everything except
`dashboard/`. Read `docs/architecture.md` for the full diagram; the essentials:

**Composition root is `sdk/ashos.ts` (`AshOS` class).** It constructs a
`Kernel`, a `ProviderRegistry`, a `MemoryManager`, a `ToolRegistry`
(pre-registering shell/git/fs tools), and an `AgentRegistry` (pre-registering
generic/code/research/git/testing/github-trending agents), and exposes
`chat()`, `plan()`, `run()` (plan + execute), `runAgent()` (find-by-capability
+ execute a single agent directly, bypassing the planner — for deterministic
capabilities like `github-trending` that don't need an LLM to decide how to
invoke them), `runWorkflow()`, and `loadPlugins()`. Both `cli/` and
`api/server.ts` construct an `AshOS` instance and are thin adapters over it —
business logic belongs in the packages below, not in CLI commands or route
handlers.

**`kernel/`** holds cross-cutting primitives with no dependency on the rest
of the system: `EventBus` (typed pub/sub every subsystem emits onto —
`task:*`, `agent:*`, `plugin:*`, `memory:updated`, `permission:*`,
`workflow:*`, `scheduler:job-fired`, `log`), `Logger`, `PermissionManager`
(regex-based dangerous-action gate with allow-once/always-allow/deny,
persisted to `.ashos/permissions.json`), `PluginManager`, `AgentRouter`,
`ContextManager`, `config.ts` (reads/writes `.ashos/config.json`), and
`dag.ts` — a generic dependency-graph executor (parallel execution bounded
by `maxParallel`, per-node retries with backoff, skip-on-failed-dependency,
optional rollback). `kernel/dag.ts` is the one executor shared by both
`planner/executor.ts` and `workflow/workflow-engine.ts` — changes to
retry/parallelism/skip semantics belong there, not duplicated in either
caller. `Kernel`'s constructor also subscribes the `Logger` to every
non-`log` bus event and mirrors it as an info-level entry, so `ash logs` /
the dashboard's Logs page show live system activity without each subsystem
calling the logger directly — don't add a manual `logger.info()` call next
to an `eventBus.emit()` for the same fact, that double-logs it.

**`providers/`** defines the `AIProvider` interface
(`chat`/`stream`/`embeddings`/`functionCalling`/`maxContext`/`supportsVision`)
and five implementations: `mock` (deterministic, offline, default provider —
tests and zero-setup use it), `anthropic` and `openai` (raw `fetch` calls,
no SDK dependency), `ollama` (local server, also LM-Studio compatible), and
`lmstudio` (raw OpenAI-compatible `fetch` against a local LM Studio server,
default `http://localhost:1234/v1`; the model always comes from
`config.providers.lmstudio.model` — never hardcode a model name — and it's
the default research provider for Innovation Intelligence, see `innovation/`
below). `ProviderRegistry` resolves the active one from `AshOSConfig.provider` /
`ASHOS_PROVIDER` env and lazily caches instances; `registerFactory` lets
plugins add new providers. Nothing outside `providers/` should import a
concrete provider class — always go through the registry.

**`tools/`** defines the `Tool` interface
(`capabilities`/`requirements`/`permissions`/`healthCheck`/`execute`) and
`ShellTool`/`GitTool`/`FsTool`. Shell and git tools take an optional
`PermissionManager` in their constructor and route every command through
`permissionManager.check()` before executing — `FsTool` does not, since its
actions are treated as non-destructive.

**`agents/`** defines the `Agent` interface and `BaseAgent` (handles
`agent:started`/`agent:finished`/`agent:failed` event emission so concrete
agents only implement `run()`). Agents are routed by a `capabilities: string[]`
tag, not by class — `AgentRegistry.findByCapability()` picks the first
match. `GenericAgent` (capability `"generic"`) is the fallback used when the
Planner emits a task whose capability doesn't map to a specialized agent.
Most agents call `context.provider`/`context.tools`, but an agent can also
talk to a real external API directly with raw `fetch` when the task is
deterministic and doesn't need an LLM in the loop — `GitHubTrendingAgent`
(capability `"github-trending"`) queries GitHub's public Search API this
way (one request per topic, merged + deduped, tolerant of a single
failing/rate-limited topic) and is invoked on demand via
`AshOS.runAgent("github-trending", ...)` / `GET /agents/github-trending`
rather than through the planner, since there's nothing for an LLM to
decide. Its tests stub global `fetch` (`vi.stubGlobal`), the same
convention `providers/lmstudio-provider.test.ts` uses — never make a test
depend on live network access.

**`planner/`** (`Planner.plan(goal)`) prompts the active provider for a JSON
task graph (`{ tasks: [{ id, title, description, capability, dependsOn }] }`)
and falls back to a single-task graph if the response isn't parseable JSON —
planning never hard-fails. `TaskExecutor` converts the graph into
`DagNode`s, routes each task by `capability` through `AgentRegistry`, and
runs it via `DagExecutor`.

**`workflow/`** (`WorkflowEngine`) is the same pattern for user-authored,
static JSON workflows (see `examples/workflows/`) instead of LLM-generated
ones: each step's `uses` field is either `"tool:<name>"` or
`"agent:<capability>"`, resolved against the same `ToolRegistry`/`AgentRegistry`
and run through the same `DagExecutor`.

**`memory/`** (`MemoryManager`) unifies four scopes: `short-term` and
`session` live in-process (Maps, the former TTL-able via `setTimeout`);
`project` and `global` persist to `.ashos/memory/project.json` and
`~/.ashos/memory/global.json` respectively. Every `remember()` call also
best-effort computes an embedding via the active provider and indexes it in
an in-process `VectorStore` (brute-force cosine similarity) for
`searchSemantic()`.

**`plugins/`** — a plugin is a directory with `manifest.json` + `index.ts`
exporting a `Plugin` whose `register(host)` receives a `PluginHost`
(`{ kernel, tools, agents, providers }`, assembled in `AshOS.loadPlugins()` —
note this is *not* the bare `Kernel`, since tools/agents/providers live on
the `AshOS` facade). `PluginManager.loadFromDirectory` dynamically
`import()`s each plugin's `index.ts`/`index.js`. The `git`/`shell` plugins
here are reference implementations of tools/agents that already ship
registered by default in `sdk/ashos.ts` — see `docs/plugin-development.md`
before adding a new one.

**`api/server.ts`** exports `createServer(ashos?)` (constructs a default
`AshOS` if none given) so tests can inject a fresh instance against an
ephemeral port instead of the module-level `if (require.main === module)`
listener block. Follow this pattern for any new route module.

## Conventions specific to this repo

- Config and persisted state live under `.ashos/` (project) and `~/.ashos/`
  (global) — both are git-ignored. `ash init` writes `.ashos/config.json`;
  never assume it exists in library code, `kernel/config.ts` always returns
  a usable default.
- The default provider is `mock` everywhere (including test setup) so the
  suite and CLI work with zero API keys — don't add tests that require a
  real `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/Ollama server.
- Anything that shells out with potential side effects must go through
  `PermissionManager.check()` (see `PermissionManager.isDangerous`'s regex
  list in `kernel/permission-manager.ts` for what currently triggers a
  prompt: `rm -rf`, `git push`, `git reset --hard`, `docker rm/rmi/prune`,
  `shutdown`, `reboot`, `mkfs`, `chmod -R 777`, raw disk writes).
- `docs/roadmap.md` is the authoritative list of what's intentionally not
  implemented yet (video/vision/voice agents, browser automation, GraphQL/
  WebSocket/MCP transports, visual workflow builder, plugin registry
  installs, distributed execution). Check it before assuming a described
  capability from `docs/architecture.md` is missing by accident.
- `AshOSConfig.innovation` is a required field (not optional) — `kernel/
  config.ts`'s `defaultConfig()` always sets it, so don't add `?.` guards
  for it in new code.
- "AshOS Intelligence" (`docs/ashos-intelligence.md`) extends Innovation
  Intelligence (`docs/innovation.md`) rather than replacing it: raw
  `Signal`s are normalized/deduped into canonical `IntelligenceEvent`s
  (`innovation/events/`) before reaching the knowledge graph/opportunity
  engine, and `RepositoryAnalystAgent`/`TechnologyRadarAgent`
  (`innovation/repository/`, `innovation/radar/`) are real, network-backed
  agents invoked on demand (like `github-trending`), not routed through
  the mock-by-default `CollectorRegistry`. The one real collector so far,
  `github-releases-collector.ts`, follows the same "offline by default,
  real via explicit opt-in" rule as everything else: it's deliberately
  **not** registered on `CollectorRegistry` (which every default `ash
  innovation discover` sweeps), only reachable via
  `InnovationModule.runLiveGithubDiscovery()` / `--live` / `{ live: true }`.
  This environment's network sandbox only allowlists `api.github.com`, so
  GitHub is the only real collector target verified here — treat other
  named sources (HuggingFace, arXiv, Reddit, HN, ...) as mock-only until
  proven reachable.
