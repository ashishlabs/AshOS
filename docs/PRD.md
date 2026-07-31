# AshOS — Product Requirements Document

**Status:** Living document. Version tracks the codebase informally — update
this alongside major feature work rather than treating it as frozen at
launch. Last updated 2026-07-28 against `claude/ashos-ai-operating-system-9fugjd`
(adds the Evolution Engine, §6 FR-38–FR-46, and LM Studio as a provider).

## 1. Vision

AshOS is an open-source **AI Operating System for developers**: a local-first,
plugin-based platform that orchestrates AI providers, tools, and specialized
agents behind one interface, so it behaves like an AI employee — understanding
a goal, planning work, delegating to the right agent, executing tools,
remembering project context, and recovering from failure — rather than a
single chat window bolted onto a terminal.

The long-term ambition (see §7) is to become "the Operating System for AI
Agents": a substrate other tools and teams build on, not a finished app.

## 2. Problem statement

Developers today stitch together AI coding assistants, shell scripts, CI
tools, and ad hoc automation by hand. Each AI provider has a different API;
each tool has a different invocation convention; there's no shared memory
across sessions; and "let the AI just do it" usually means a single
unstructured prompt with no planning, no retry, no audit trail, and no way to
swap the underlying model without rewriting the integration.

AshOS's bet: a **common kernel** (events, permissions, plugins, a DAG
executor) plus a **common provider interface** plus a **capability-routed
agent system** turns "AI does my dev work" from a one-off script into a
reusable, inspectable, extensible platform.

## 3. Target users

- **Individual developers** who want a local-first AI assistant that can plan
  multi-step work (not just answer one prompt at a time) and remembers their
  project across sessions.
- **Teams building on top of AI agents** who need a provider-agnostic
  foundation (so a model/vendor change isn't a rewrite) and a plugin
  contract so they can add proprietary tools/agents without forking core.
- **Plugin/tool authors** who want a stable, documented contract
  (`Tool`, `Agent`, `AIProvider`, `Plugin`) to extend the system rather than
  needing to understand its internals.

Non-target (for now): end users who want a polished consumer chat app, or
teams needing a hosted/multi-tenant SaaS — AshOS today is a
single-user, single-machine, run-it-yourself system (see §5 Non-Goals).

## 4. Goals

- **G1 — Provider-agnostic core.** Every AI call goes through one interface
  (`AIProvider`); switching models is a config change, never a code change.
- **G2 — Goal → plan → execution, not just chat.** A natural-language goal
  decomposes into a dependency graph of tasks, runs with real parallelism,
  retries, and rollback — the same executor for both LLM-generated plans and
  user-authored workflows.
- **G3 — Everything is inspectable and controllable.** Every action emits an
  event; every dangerous action goes through a permission gate with
  allow-once/always/deny; logs and activity are visible in real time via the
  CLI and dashboard, not buried in stdout.
- **G4 — Extensibility without forking.** New providers, tools, and agents
  are additive (a new file + a registration call, or a full plugin package)
  — they never require editing kernel code.
- **G5 — Local-first, zero-setup by default.** The system is fully
  functional offline with no API keys (`mock` provider), so trying it,
  testing it, and developing against it never depends on external services
  or cost.

## 5. Non-goals (explicitly out of scope right now)

- Hosting a multi-tenant SaaS version, auth/billing, or team accounts.
- Being a general-purpose chatbot UI competing with consumer AI apps.
- Media generation pipelines (video/voice/image) as first-party code — these
  are modeled as plugin surfaces (see the illustrative
  `examples/workflows/youtube-pipeline.json`) but not implemented.
- Distributed/multi-machine execution — today's `DagExecutor` runs in a
  single Node process.
- Mobile apps, browser extensions, IDE plugins.

## 6. Functional requirements

Status legend: ✅ Shipped · 🚧 Partially shipped · ⏳ Planned (roadmap)

| ID | Requirement | Status | Where |
|---|---|---|---|
| FR-1 | Common `AIProvider` interface (chat, stream, embeddings, function-calling flag, max context, vision flag) | ✅ | `providers/types.ts` |
| FR-2 | Provider implementations: mock, Anthropic, OpenAI, Ollama, LM Studio | ✅ | `providers/*.ts` |
| FR-3 | One-line provider switch via config/env, no code changes elsewhere | ✅ | `ProviderRegistry`, `ash provider set` |
| FR-4 | Additional providers (Groq, OpenRouter, local GGUF) | ⏳ | `docs/roadmap.md` |
| FR-5 | Goal decomposition into a dependency-graph task plan | ✅ | `planner/planner.ts` |
| FR-6 | Parallel execution with bounded concurrency, retries with backoff, skip-on-failed-dependency, rollback hooks | ✅ | `kernel/dag.ts` |
| FR-7 | User-authored static workflows (JSON) on the same executor | ✅ | `workflow/workflow-engine.ts` |
| FR-8 | Visual (drag-and-drop) workflow builder | ⏳ | `docs/roadmap.md` |
| FR-9 | Capability-routed agents (generic, code, research, git, testing) | ✅ | `agents/*.ts` |
| FR-10 | Media/creative agents (video, vision, voice) | ⏳ | illustrative only — `examples/workflows/youtube-pipeline.json` |
| FR-11 | Browser automation agent (Playwright) | ⏳ | `docs/roadmap.md` |
| FR-12 | Tool contract with capabilities/requirements/permissions/health-check | ✅ | `tools/types.ts` |
| FR-13 | Shell, git, filesystem tools | ✅ | `tools/*.ts` |
| FR-14 | Docker, FFmpeg, Playwright, ComfyUI tool integrations | ⏳ | `docs/roadmap.md` |
| FR-15 | Permission gate for dangerous actions with allow-once/always/deny | ✅ | `kernel/permission-manager.ts` |
| FR-16 | Persisted permission decisions | ✅ | `.ashos/permissions.json` |
| FR-17 | Sandboxed tool execution | ⏳ | not implemented — tools run in-process today |
| FR-18 | Plugin contract (`manifest.json` + `Plugin.register(host)`) | ✅ | `kernel/plugin-manager.ts`, `docs/plugin-development.md` |
| FR-19 | Local plugin discovery/loading | ✅ | `ash plugin list/install`, `plugins/` |
| FR-20 | Community plugin registry / remote install | ⏳ | `docs/roadmap.md` |
| FR-21 | Memory scopes: short-term, session, project, global | ✅ | `memory/memory-manager.ts` |
| FR-22 | Semantic (vector) search over memory | ✅ (brute-force, in-process) | `memory/vector-store.ts` |
| FR-23 | Scalable vector store for large memory sets | ⏳ | see Test Report "known gaps" |
| FR-24 | Typed event bus every subsystem publishes to | ✅ | `kernel/event-bus.ts` |
| FR-25 | Live activity/log visibility (not just stdout) | ✅ | Kernel mirrors bus events into the logger; `ash logs`, dashboard Logs/Activity |
| FR-26 | Cron-based scheduler for recurring automation | ✅ (engine only) | `scheduler/scheduler.ts` |
| FR-27 | Scheduler wired into CLI/API (create/list/cancel jobs from outside code) | ⏳ | engine exists, no user-facing surface yet |
| FR-28 | CLI covering init/status/doctor/provider/plugin/plan/run/chat/memory/logs | ✅ | `cli/` |
| FR-29 | REST API covering chat/plan/execute/workflow/agents/providers/tools/tasks/events/memory/logs/health | ✅ | `api/server.ts`, `docs/api.md` |
| FR-30 | Streaming chat over HTTP | ✅ (chunked, not SSE) | `POST /chat/stream` |
| FR-31 | GraphQL / WebSocket / MCP transports | ⏳ | `docs/roadmap.md` |
| FR-32 | Web dashboard: status, tools, plan, workflow, evolution, innovation, memory, logs, chat | ✅ | `dashboard/` (Providers/Agents tabs were dropped from the UI as unused surface — both remain fully available via `ash provider`/`ash status` and `GET /providers`/`/agents`) |
| FR-33 | Dashboard: analytics/observability (token usage, latency, success/failure rates) | 🚧 | Evolution tab has latency trend/acceptance-rate/leaderboard; no system-wide token-usage or chat/plan latency dashboards yet |
| FR-34 | SDK facade for embedding AshOS in other Node apps | ✅ | `sdk/ashos.ts` |
| FR-35 | API request validation (reject malformed bodies with 4xx) | ✅ | added in this pass — see `docs/test-report.md` |
| FR-36 | Secret encryption at rest (API keys in `.ashos/config.json`) | ⏳ | currently stored plaintext locally |
| FR-37 | Multi-agent collaboration, distributed execution, team/shared memory | ⏳ | long-term vision only |
| FR-38 | Evolution Engine loop: observe → hypothesize → mutate → build → test → benchmark → evaluate → accept/reject → store | ✅ | `evolution/engine/evolution-engine.ts`, `docs/evolution.md` |
| FR-39 | Reversible mutation contract + built-ins (prompt rewrite, temperature, retry count, workflow reorder) | ✅ (4/~11 target kinds real) | `evolution/mutation/` |
| FR-40 | Benchmark framework (input/expected/scoring fn/timeout/metadata) + built-ins | ✅ (3/10 categories real: code-gen, reasoning, documentation) | `evolution/benchmark/` |
| FR-41 | Isolated git-worktree execution pipeline; `main`/base branch protected in code; `autoMerge` gated, defaults off | ✅ | `evolution/storage/git-workspace.ts` |
| FR-42 | Weighted-score evaluator + accept/reject vs a running baseline | ✅ | `evolution/evaluation/evaluator.ts` |
| FR-43 | Experiment history store (JSON, one file per experiment) + leaderboard/acceptance-rate queries | ✅ | `evolution/history/experiment-store.ts` |
| FR-44 | LM Studio as the default research provider (OpenAI-compatible, local, model never hardcoded) | ✅ | `providers/lmstudio-provider.ts` |
| FR-45 | Evolution REST API, dashboard tab, and `ash evolve` CLI | ✅ | `api/server.ts`, `dashboard/src/App.tsx`, `cli/commands/evolve.ts` |
| FR-46 | Evolution mutations/benchmarks are plugin-extensible, same mechanism as tools/agents | ✅ | `kernel/types.ts` (`PluginHost.evolution`), `evolution/plugins/evolution-extras/` |
| FR-47 | GPU/resource metrics for experiments (best-effort, no hard dependency on a GPU being present) | ✅ | `evolution/engine/resource-metrics.ts` |
| FR-48 | Self-improving planner (Evolution Engine can propose/test planner-targeted mutations) | 🚧 | `retry-count-adjust` mutation targets the planner's executor; no dedicated planner-strategy mutation yet |

## 7. Long-term vision (unscoped)

Carried from the original project brief, not committed to a milestone:
multi-agent collaboration, voice interaction, vision-based workflows,
autonomous coding sessions, distributed execution across machines, team
collaboration with shared memory, a mobile companion app, optional cloud
sync, a plugin marketplace, a self-improving planner using execution
feedback, and robotics/IoT integration. These inform architectural choices
(e.g., the plugin contract, the provider-agnostic core) without being
scheduled work.

## 8. Non-functional requirements

- **Local-first & zero-cost by default**: full functionality with the
  offline `mock` provider; no test or CLI path should require a real API key.
- **Strong typing**: TypeScript strict mode is the quality gate
  (`npm run typecheck`); no `any` without justification.
- **Testability**: business logic lives in `kernel/`/`providers/`/`tools/`/
  `agents/`/`planner/`/`workflow/`/`sdk/`, not in CLI commands or route
  handlers, specifically so it can be unit tested without a process boundary.
- **Cross-platform**: Node 18+, no OS-specific code paths today beyond
  shelling out to `bash` (Windows support is untested — tracked as a gap).
- **Observability**: every subsystem action is an event; every event is
  mirrored into the logger; both are queryable via API/CLI/dashboard.
- **Auditability**: dangerous actions are gated and their decisions
  persisted, forming a de facto audit trail (`.ashos/permissions.json` +
  `permission:requested`/`permission:decided` events).

## 9. Success metrics

These are the metrics worth instrumenting as the project matures; only the
first is currently measurable from the repo itself.

| Metric | Current baseline | Target |
|---|---|---|
| Test coverage (statements) | 70.4% (`docs/test-report.md`) | 85%+ on `kernel/`, `planner/`, `workflow/`, `api/`; explicit exemptions documented for network-dependent provider code |
| Time from `git clone` to first successful `ash run` | ~2 min (`npm install && ash init && ash run`), zero API keys | keep at "no config required" |
| Provider switch effort | 1 CLI command / 1 config line | maintain — this is a core differentiator |
| Plugin authoring effort | 1 manifest + 1 file, documented in `docs/plugin-development.md` | keep under ~30 min for a new tool/agent |
| Dangerous-action coverage | shell + git tools gated; regex-based classifier | expand classifier coverage as new tools land; add a real audit-log UI |

## 10. Current milestone status

- **M0 — Foundation (shipped, this repo).** Kernel primitives, five
  providers (incl. LM Studio), three tools, five agents, planner + workflow
  on a shared DAG executor, memory with vector search, CLI, REST API, SDK,
  a working dashboard, plugin contract with reference plugins, CI, Docker,
  and a test suite (166+ tests — see `docs/test-report.md`).
- **M0.5 — Evolution Engine (shipped, this repo).** Continuous, reversible
  experimentation: observe → hypothesize (research provider, LM Studio +
  Gemma by default) → mutate (isolated git worktree) → build → test →
  benchmark → evaluate → accept/reject → store, exposed via CLI/API/
  dashboard and plugin-extensible. See `docs/evolution.md` for the full
  design and its own gap list.
- **M1 — Hardening (next, suggested).** Close the gaps FR-35→FR-37 imply:
  encrypt secrets at rest, add a sandboxed tool execution mode, wire the
  scheduler into CLI/API for arbitrary (non-evolution) jobs, resolve the
  `AgentRouter`/`AgentRegistry` duplication noted in the test report, add
  provider tests via fetch mocking, add dashboard component tests, fill
  out the remaining Evolution benchmark categories/mutation kinds.
- **M2 — Ecosystem.** Docker/FFmpeg/Playwright tool plugins, a real
  web-search tool (so the Research agent has grounding beyond model
  knowledge), a plugin registry for remote installs, GraphQL/WebSocket/MCP
  transports, additional research providers (Groq, OpenRouter, GGUF).
- **M3 — Scale.** Distributed execution, team/shared memory, a real
  observability stack (token usage, latency, cost) spanning the whole
  system (not just Evolution experiments), the visual workflow builder.

## 11. Open questions

- **Sandboxing model**: should tool execution move to a subprocess/container
  boundary by default, or stay opt-in per tool? Affects FR-17 and the
  permission model's threat model.
- **Plugin trust**: local `plugins/` loading has no signature/verification
  step — acceptable for a single-user local-first tool, but blocks FR-20
  (remote registry) until addressed.
- **Vector store scale**: at what memory-record count does brute-force
  cosine similarity (FR-22) become a real bottleneck, and is an embedded
  ANN index (vs. an external vector DB dependency) the right tradeoff for a
  local-first tool?
- **Windows support**: `ShellTool`/`GitTool` shell out via `bash -c`, which
  doesn't exist by default on Windows. Is WSL a hard requirement, or does
  this need a cross-platform shell abstraction?

## 12. References

- `docs/architecture.md` — system diagram and package responsibilities.
- `docs/roadmap.md` — shipped vs. deferred feature list (source of truth
  this PRD's status column is derived from).
- `docs/test-report.md` — latest test results, coverage, and findings.
- `docs/plugin-development.md`, `docs/provider-guide.md`, `docs/api.md`,
  `docs/cli.md` — contracts referenced throughout §6.
- `docs/evolution.md` — Evolution Engine design: benchmark/mutation/
  evaluation contracts, git-worktree isolation, experiment schema, and its
  own gap list (FR-38–FR-48, M0.5).
