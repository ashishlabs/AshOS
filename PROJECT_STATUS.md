# AshOS Project Status

**Generated:** 2026-08-02

**Repository Commit:** `d2d9418191c8430740d7095a4e8e99519e4ffc59` (branch `claude/ashos-ai-operating-system-9fugjd`)

**Methodology:** Every status below is backed by a file path, class/function name, test, or route that was directly read or grepped in this repository during this audit. Nothing is marked ✅ COMPLETE on the basis of a docs claim alone — docs were cross-checked against code, tests were run (`npm test`, `npm run test:coverage`, `npm run typecheck`), and directories were listed to confirm non-empty implementations. Where evidence could not be found, the feature is marked 🔴 NOT IMPLEMENTED regardless of what any doc says.

---

## Executive Summary

| Metric | Value |
|---|---|
| Total features tracked | 29 |
| ✅ Complete | 20 |
| 🟡 In Progress | 3 |
| 🔴 Not Implemented | 6 |
| ⚪ Planned (documented, not started) | 0 (folded into Not Implemented — see Missing Features) |
| ⚫ Blocked | 0 |
| **Overall completion (weighted by the user's own v1-v5 milestones)** | **v1: 100%, v2: ~97%, v3: ~50%, v4: ~35%, v5: ~10%** |
| Tests passing | 331 / 331 (49 test files) |
| Statement coverage | 84.51% (branches 82.49%, functions 86.02%) |
| TODO/FIXME comments in source | 0 |
| Dashboard automated tests | 0 (verified manually via Playwright screenshots per project convention) |

The system is a genuinely working, well-tested local-first AI agent platform (v1 of the user's own milestone scale is fully shipped, v2 now ~97% with all five North Star Tier 1 stages — Local Codebase Intelligence, Model Router, Outcome Memory, General Knowledge Graph, Verification Gate — shipped), with a large and mostly real "Innovation/AshOS Intelligence" subsystem layered on top (v4's discovery half). The biggest verified gaps are: 6 of 11 named specialist agent roles still missing (v2's last gap), no MCP/browser/Docker-as-a-tool integrations, no general-purpose (non-AI-ecosystem) research capability, no self-improvement/evaluation framework (the previous Evolution Engine was deliberately removed and never rebuilt), and zero creative-media generation. Two directories (`evolution/`, `tests/`) are empty leftovers.

---

## Architecture Overview

**Language/runtime:** TypeScript (strict), Node.js ≥18, single package at the root (not npm workspaces except `dashboard/`, which is its own Vite/React workspace).

**Persistence:** No database of any kind. Every subsystem persists to JSON files under `.ashos/` (project-scoped) or `~/.ashos/` (global) — confirmed via `kernel/config.ts`, `memory/memory-manager.ts`, `innovation/*/​*-store.ts`, `codebase/codebase-store.ts`. No `pg`, `mongodb`, `prisma`, `sqlite3`, or ORM packages in `package.json`.

**AI providers (verified in `providers/`):** `mock` (offline default), `anthropic`, `openai` (both raw `fetch`, no vendor SDK), `ollama` (local), `lmstudio` (local, OpenAI-compatible). Resolved via `ProviderRegistry`; `ModelRouter` (`providers/router.ts`) adds task-tiered selection on top, off by default.

**Folders (top-level, verified via `ls`):**

```
agents/      15 .ts files   — Agent interface, BaseAgent, 6 concrete agents, outcome recording
api/          2 .ts files   — Express REST API (38 routes)
cli/         14 .ts files   — `ash` CLI, 11 command groups
codebase/     7 .ts files   — Local Codebase Intelligence (Stage 1 of North Star plan)
dashboard/   16 .ts(x) files — Vite + React dashboard, own workspace
docs/        14 .md files   — architecture, roadmap, per-feature docs
evolution/    0 files       — EMPTY (leftover from a removed subsystem, see Technical Debt)
examples/     2 .json files — example workflow definitions
innovation/  54 .ts files   — Innovation/AshOS Intelligence (largest subsystem)
kernel/      17 .ts files   — event bus, logger, permissions, plugin loader, DAG executor, config
memory/       5 .ts files   — MemoryManager, VectorStore
planner/      5 .ts files   — goal → task graph + executor
plugins/      2 reference plugins (git, shell) + manifests
providers/   12 .ts files   — AIProvider implementations + registry + router
scheduler/    4 .ts files   — cron-based Scheduler
sdk/          3 .ts files   — AshOS facade (composition root)
tests/        0 files       — EMPTY (see Technical Debt; all real tests are colocated *.test.ts)
tools/        7 .ts files   — Shell/Git/Fs tools + registry
workflow/     4 .ts files   — JSON workflow engine
```

**Dependencies (root `package.json`):** `commander`, `cors`, `dotenv`, `express`, `node-cron` (runtime); `tsx`, `typescript`, `vitest`, `@vitest/coverage-v8`, `concurrently` (dev). No auth, database, MCP, browser-automation, or media-generation packages anywhere in the dependency tree — confirmed by direct inspection, not inference.

**CI/Deployment:** `.github/workflows/ci.yml` runs `typecheck` + `test:coverage` on push/PR. `Dockerfile` (multi-stage, Node 22) + `docker-compose.yml` (API + Ollama sidecar) exist and are wired for container deployment — this is deployment infrastructure, not an agent-usable "Docker tool" (see Feature Matrix).

---

## Feature Matrix

| Feature | Status | Progress | Evidence | Priority |
|---|---|---|---|---|
| Kernel primitives | ✅ COMPLETE | 100% | `kernel/{event-bus,logger,permission-manager,plugin-manager,dag,config}.ts` + tests | Core |
| AI Provider System | ✅ COMPLETE | 100% | `providers/{anthropic,openai,ollama,lmstudio,mock}-provider.ts`, `registry.ts` | Core |
| Model Router | ✅ COMPLETE | 100% (off by default) | `providers/router.ts`, `docs/model-router.md`, wired in `agents/base-agent.ts` | Medium |
| Tool System | ✅ COMPLETE | 100% (3 tools) | `tools/{shell,git,fs}-tool.ts`, `tools/registry.ts` | Core |
| Agent System | ✅ COMPLETE | 100% (15 agents registered) | `agents/base-agent.ts`, `agents/registry.ts`, 6 core + 8 Innovation + 1 Codebase agents | Core |
| Memory System | ✅ COMPLETE | 100% (4 scopes) | `memory/memory-manager.ts`, `memory/vector-store.ts` | Core |
| Outcome Memory | ✅ COMPLETE | 100% | `agents/outcome.ts`, `docs/outcome-memory.md` | Medium |
| Planner | ✅ COMPLETE | 100% | `planner/planner.ts`, `planner/executor.ts` | Core |
| Workflow Engine | ✅ COMPLETE | 100% | `workflow/workflow-engine.ts`, `examples/workflows/*.json` | Core |
| Scheduler | ✅ COMPLETE | 100% (cron only) | `scheduler/scheduler.ts` | Medium |
| Plugin System | ✅ COMPLETE | 100% (2 reference plugins) | `kernel/plugin-manager.ts`, `plugins/{git,shell}-plugin/` | Medium |
| REST API | ✅ COMPLETE | 100% (38 routes) | `api/server.ts` | Core |
| CLI (`ash`) | ✅ COMPLETE | 100% (11 command groups) | `cli/index.ts`, `cli/commands/*.ts` | Core |
| Dashboard | 🟡 IN PROGRESS | ~90% | `dashboard/src/App.tsx` (1200 lines, 8 tabs) | High |
| Innovation Intelligence (opportunity discovery) | ✅ COMPLETE | 100% | `innovation/{opportunity,history,profile,brief,lifecycle}*` | High |
| Event Normalization & Dedup | ✅ COMPLETE | 100% | `innovation/events/*` | Medium |
| Repository Intelligence (external) | ✅ COMPLETE | 100% | `innovation/repository/*`, `innovation/agents/repository-analyst-agent.ts` | High |
| Local Codebase Intelligence | ✅ COMPLETE | 100% (v1 scope) | `codebase/*`, `docs/codebase-intelligence.md` | High |
| Technology Radar | ✅ COMPLETE | 100% | `innovation/radar/*` | Medium |
| Real Collectors (GitHub/HN/Reddit/arXiv/HF) | 🟡 IN PROGRESS | 100% code, ~20% live-verified | `innovation/collectors/{github-releases,hn,reddit,arxiv,huggingface}-collector.ts` — only GitHub confirmed reachable in this sandbox | Medium |
| Knowledge Graph (general-purpose) | ✅ COMPLETE | 100% (v1 scope) | `KnowledgeGraph` moved to shared `graph/` package with a `namespace` option; `AshOS.knowledgeGraph` (`.ashos/graph.json`, no namespace) populated automatically by every `BaseAgent.execute()` (`project`/`agent`/`task` nodes, `produced-by`/`part-of` edges) and enriched by `CodebaseAnalystAgent`; `ash graph stats/nodes/neighbors`, `/graph*`. Innovation's own namespaced graph (`{ namespace: "innovation" }`) unchanged. See `docs/knowledge-graph.md` | High |
| Multi-Agent Specialist Roles | 🟡 IN PROGRESS | ~40% | Only generic-purpose roles exist (Code/Research/Git/Testing/Generic + 8 Innovation agents + Codebase Analyst); no Reviewer, Security Auditor, DevOps, UI Designer, Architect, or Video Creator agents | High |
| Verification Gate | ✅ COMPLETE | 100% | `planner/executor.ts`'s `TaskExecutor` runs the registered `verify`-capability agent (`TestingAgent` by default) inside the same DAG node immediately after a `"code"`-capability task succeeds; throws on failure so `DagExecutor`'s existing retry/fail/skip-dependents behavior applies. On by default, `verify: false` to disable. See `docs/verification-gate.md` | High |
| MCP (Model Context Protocol) | 🔴 NOT IMPLEMENTED | 0% | No MCP client or server code; no `@modelcontextprotocol/*` dependency | Medium |
| Browser Automation | 🔴 NOT IMPLEMENTED | 0% | No Playwright/Puppeteer dependency or tool | Low |
| Docker as an agent Tool | 🔴 NOT IMPLEMENTED | 0% | Docker exists only as deployment infra (`Dockerfile`, `docker-compose.yml`), not as a `Tool` an agent can invoke | Low |
| Authentication | 🔴 NOT IMPLEMENTED | 0% | No auth dependency or code anywhere in the tree | Low (single-user local tool) |
| Self-Improvement / Evaluation Framework | 🔴 NOT IMPLEMENTED | 0% | Previously existed as `evolution/` (mutation engine, benchmark runner, evaluator); deliberately removed in commit `8f7400b`, never rebuilt | High |
| Creative Studio (media generation) | 🔴 NOT IMPLEMENTED | 0% | No image/video/audio generation provider or dependency | Low (deliberately deprioritized) |

---

## Detailed Feature Reports

### Kernel Primitives

**Status:** ✅ COMPLETE
**Priority:** Core

**Description**
The composition root's cross-cutting substrate: a typed pub/sub `EventBus`, a structured `Logger` that mirrors every non-`log` bus event automatically, a regex-based `PermissionManager` gating dangerous shell/git actions, a `PluginManager` that dynamically `import()`s plugin directories, and a generic `DagExecutor` (parallelism, retries with backoff, skip-on-failed-dependency) shared by both the Planner and the Workflow Engine.

**Evidence**
- `kernel/event-bus.ts` — `AshOSEventName` union (30 event names), `EventBus` class with history buffer
- `kernel/logger.ts`, `kernel/permission-manager.ts` (`DANGEROUS_PATTERNS`, 11 regexes), `kernel/plugin-manager.ts`, `kernel/dag.ts`, `kernel/config.ts`
- Tests: `kernel/*.test.ts` — all passing

**Completed**
- Event bus with history + wildcard subscription
- Permission gate with allow-once/always-allow/deny + persistence to `.ashos/permissions.json`
- Generic DAG executor with configurable `maxParallel`, retries, rollback hooks
- Config load/save round-trip (`.ashos/config.json`)

**Remaining**
- Nothing outstanding at the kernel layer itself

**Definition of Done**
- [x] Functional implementation complete
- [x] Architecture follows project standards
- [x] Integrated with existing modules
- [x] Error handling implemented
- [x] Logging added
- [x] Configuration supported
- [x] Documentation written (`docs/architecture.md`)
- [x] Unit tests added
- [x] Integration tests added (via SDK/API/CLI tests exercising the kernel indirectly)
- [ ] Performance validated (no load testing has been done — acceptable for current single-user scale)
- [x] Security reviewed (dangerous-command gating is the explicit security surface)
- [x] Works with local models (provider-agnostic)
- [x] Works with cloud models (provider-agnostic)
- [ ] UX completed (N/A — no direct UI)
- [x] No TODOs remain
- [x] Code reviewed (this audit)
- [x] Ready for production (for its actual scope: single-user/small-team local tool)

**Risks:** None significant. **Dependencies:** None (this is the foundation layer). **Recommended Next Steps:** None required.

---

### AI Provider System

**Status:** ✅ COMPLETE
**Priority:** Core

**Description**
A common `AIProvider` interface (`chat`/`stream`/`embeddings`/`functionCalling`/`maxContext`/`supportsVision`) with five implementations, resolved through a registry so no calling code ever references a concrete provider class.

**Evidence**
- `providers/types.ts` (interface), `providers/{anthropic,openai,ollama,lmstudio,mock}-provider.ts`, `providers/registry.ts`
- Tests: `providers/*.test.ts` (network-touching tests stub `fetch` via `vi.stubGlobal`)

**Completed**
- All five providers implement the full interface
- `mock` is the default so the entire test suite and CLI work with zero API keys
- `registerFactory()` lets plugins add new providers (e.g. Groq, OpenRouter — documented as a future step, not built)

**Remaining**
- No provider beyond the five above is implemented (Groq/OpenRouter/local GGUF runners are named in `docs/roadmap.md` as deferred)

**Definition of Done**
- [x] Functional implementation complete
- [x] Architecture follows project standards
- [x] Integrated with existing modules
- [x] Error handling implemented
- [x] Logging added
- [x] Configuration supported (`.ashos/config.json` + env vars)
- [x] Documentation written (`docs/provider-guide.md`)
- [x] Unit tests added
- [x] Integration tests added
- [ ] Performance validated
- [x] Security reviewed (API keys read from env/config, never hardcoded)
- [x] Works with local models (Ollama, LM Studio)
- [x] Works with cloud models (Anthropic, OpenAI)
- [ ] UX completed (N/A)
- [x] No TODOs remain
- [x] Code reviewed
- [x] Ready for production

**Risks:** None. **Dependencies:** None. **Recommended Next Steps:** Add a Groq/OpenRouter provider if cost/speed diversification becomes a priority.

---

### Model Router

**Status:** ✅ COMPLETE (feature itself finished; off by default)
**Priority:** Medium

**Description**
Task-aware provider selection — three tiers (`simple`/`standard`/`complex`), each mapped to a configured provider name, so routine work can default to a cheap/local model while genuinely hard tasks escalate. Integrated once, in `BaseAgent.execute()`, so every agent is routing-aware without its own code changing.

**Evidence**
- `providers/router.ts` (`ModelRouter`, `defaultComplexityForCapability`), `kernel/config.ts` (`RouterConfig`)
- `agents/base-agent.ts`'s `resolveContext()`
- CLI: `cli/commands/provider.ts` (`router status/enable/disable/set`); REST: `GET`/`PATCH /providers/router`
- Tests: `providers/router.test.ts`, `agents/base-agent.test.ts`
- Docs: `docs/model-router.md`

**Completed**
- Full tier-selection logic with safe fallback to the active provider on misconfiguration
- CLI + REST surfaces
- Verified live in a real temp project (enable → set tiers → status → `.ashos/config.json` persisted)

**Remaining**
- No automatic complexity inference beyond the per-capability default (documented as an intentional limitation, not a gap)
- No cost/latency tracking or benchmark-driven tier assignment
- `Planner.plan()` itself does not route — only agent execution does

**Definition of Done**
- [x] Functional implementation complete
- [x] Architecture follows project standards
- [x] Integrated with existing modules
- [x] Error handling implemented (fallback on unregistered provider)
- [x] Logging added
- [x] Configuration supported
- [x] Documentation written
- [x] Unit tests added
- [x] Integration tests added
- [ ] Performance validated
- [x] Security reviewed (no new attack surface — pure selection logic)
- [x] Works with local models
- [x] Works with cloud models
- [ ] UX completed (no dashboard card yet — CLI/REST only)
- [x] No TODOs remain
- [x] Code reviewed
- [x] Ready for production

**Risks:** Low. **Dependencies:** `ProviderRegistry`. **Recommended Next Steps:** A dashboard card; benchmark-driven tier recommendations (would depend on Outcome Memory data accumulating).

---

### Tool System

**Status:** ✅ COMPLETE (for the three tools that exist)
**Priority:** Core

**Description**
A `Tool` interface (capabilities/requirements/permissions/health-check/execute) with Shell, Git, and Filesystem implementations. Shell and Git route every command through `PermissionManager`; Fs is treated as non-destructive and bypasses the gate.

**Evidence**
- `tools/types.ts`, `tools/{shell,git,fs}-tool.ts`, `tools/registry.ts`

**Completed**
- All three tools implement the full interface with health checks
- Permission gating verified for shell/git dangerous-command paths (tests in `agents/agents.test.ts`, `api/server.test.ts`)

**Remaining**
- No Docker tool, no browser-automation tool, no generic HTTP/API tool (an agent hitting an arbitrary REST API today has to do it ad hoc, as `GitHubTrendingAgent` and the Innovation collectors do with raw `fetch`, not through a reusable `Tool`)

**Definition of Done**
- [x] Functional implementation complete
- [x] Architecture follows project standards
- [x] Integrated with existing modules
- [x] Error handling implemented
- [x] Logging added (via event bus)
- [x] Configuration supported
- [x] Documentation written
- [x] Unit tests added
- [x] Integration tests added
- [ ] Performance validated
- [x] Security reviewed (this **is** the security-critical surface — `PermissionManager` gating)
- [x] Works with local models (tools are model-agnostic)
- [x] Works with cloud models
- [ ] UX completed (N/A)
- [x] No TODOs remain
- [x] Code reviewed
- [x] Ready for production

**Risks:** None for what exists. **Dependencies:** `PermissionManager`. **Recommended Next Steps:** Docker tool, browser-automation tool, generic HTTP tool — all named in Missing Features below.

---

### Agent System

**Status:** ✅ COMPLETE (architecture); 🟡 role coverage is partial — see "Multi-Agent Specialist Roles" below
**Priority:** Core

**Description**
`Agent` interface + `BaseAgent` (lifecycle events, routing integration, outcome recording) + `AgentRegistry` (capability-string routing, first-match). 15 concrete agent instances are registered across the codebase today.

**Evidence**
- `agents/base-agent.ts`, `agents/registry.ts`, `agents/types.ts`
- Concrete agents: `agents/{generic,code,research,git,testing,github-trending}-agent.ts` (6), `innovation/agents/intelligence-agent.ts` (×6 domains via factory), `innovation/agents/{repository-analyst,technology-radar}-agent.ts` (2), `codebase/agents/codebase-analyst-agent.ts` (1) = **15 total**
- Tests: `agents/agents.test.ts`, `agents/base-agent.test.ts`, `agents/github-trending-agent.test.ts`, per-agent tests under `innovation/agents/` and `codebase/agents/`

**Completed**
- Full lifecycle event emission (`agent:started/finished/failed`)
- Capability-based routing, first-match semantics
- Model Router integration (per-task provider selection)
- Outcome Memory integration (every attempt recorded)

**Remaining**
- No Reviewer, Security Auditor, DevOps Engineer, UI Designer, Architect, or Video Creator agents (all named explicitly in the North Star vision's goal #5)
- No "mixture of agents" / ensemble pattern (multiple agents on the same task + an aggregator) — the DAG executor runs independent tasks in parallel, not the same task redundantly

**Definition of Done**
- [x] Functional implementation complete (architecture)
- [x] Architecture follows project standards
- [x] Integrated with existing modules
- [x] Error handling implemented
- [x] Logging added
- [x] Configuration supported
- [x] Documentation written
- [x] Unit tests added
- [x] Integration tests added
- [ ] Performance validated
- [x] Security reviewed
- [x] Works with local models
- [x] Works with cloud models
- [ ] UX completed (dashboard shows agents list only, no per-agent management UI)
- [x] No TODOs remain
- [x] Code reviewed
- [ ] Ready for production (architecture yes; role coverage is incomplete for the stated vision)

**Risks:** None architecturally. **Dependencies:** None. **Recommended Next Steps:** See "Multi-Agent Specialist Roles" feature and Missing Features.

---

### Memory System

**Status:** ✅ COMPLETE
**Priority:** Core

**Description**
`MemoryManager` unifying short-term (in-process, TTL-able), session (in-process), project (`.ashos/memory/project.json`), and global (`~/.ashos/memory/global.json`) scopes, with a brute-force cosine-similarity `VectorStore` for semantic recall whenever an embedding is available.

**Evidence**
- `memory/memory-manager.ts`, `memory/vector-store.ts`, `memory/types.ts`
- Tests: `memory/memory-manager.test.ts`

**Completed**
- All four scopes with correct persistence/non-persistence semantics
- Best-effort embedding computation on every `remember()`
- Query by scope/tag/text; semantic search fallback to text search when no provider is available

**Remaining**
- `VectorStore` is brute-force (fine at current scale; would need indexing at large scale — not a current problem)
- No cross-scope deduplication

**Definition of Done**
- [x] Functional implementation complete
- [x] Architecture follows project standards
- [x] Integrated with existing modules
- [x] Error handling implemented
- [x] Logging added (`memory:updated` event)
- [x] Configuration supported
- [x] Documentation written (inline in `docs/architecture.md`; no dedicated doc)
- [x] Unit tests added
- [x] Integration tests added
- [ ] Performance validated (fine at current scale; unverified at large scale)
- [x] Security reviewed
- [x] Works with local models
- [x] Works with cloud models
- [ ] UX completed (dashboard Memory tab exists, list/forget only)
- [x] No TODOs remain
- [x] Code reviewed
- [x] Ready for production

**Risks:** Full-file read/write per write call could become a bottleneck at very high volume — see Technical Debt. **Dependencies:** An `AIProvider` for embeddings (optional). **Recommended Next Steps:** A dedicated `docs/memory.md`; retention/pruning policy once volume grows (see Outcome Memory below, which writes into this same store).

---

### Outcome Memory

**Status:** ✅ COMPLETE
**Priority:** Medium

**Description**
Every agent task attempt (success or failure) is automatically recorded into project memory — no opt-in flag, since writing a record has no behavioral effect. Closes the "AshOS should remember failures and successful solutions" requirement.

**Evidence**
- `agents/outcome.ts` (`TaskOutcome`, `buildOutcome`, `outcomeMemoryKey`)
- Integration: `agents/base-agent.ts`'s `recordOutcome()`
- CLI: `ash memory list --tag outcome/failure/<agent>`
- Tests: `agents/outcome.test.ts`, `agents/base-agent.test.ts` (outcome-memory describe block)
- Docs: `docs/outcome-memory.md`

**Completed**
- Full record shape (agent, capability, task id, description, outcome, output/error, duration, timestamp)
- Unique-per-attempt keys (random suffix, since millisecond timestamps can collide)
- Best-effort — a memory-write failure never fails the task itself
- Verified live: a real `ash run` produced a queryable record

**Remaining**
- No automatic pattern extraction from accumulated outcomes (this is explicitly the next step toward North Star goal #10, Continuous Learning)
- No retention/pruning policy — every attempt is a permanent record

**Definition of Done**
- [x] Functional implementation complete
- [x] Architecture follows project standards
- [x] Integrated with existing modules
- [x] Error handling implemented
- [x] Logging added
- [x] Configuration supported (N/A — no flag by design)
- [x] Documentation written
- [x] Unit tests added
- [x] Integration tests added
- [ ] Performance validated (unbounded growth is a documented known limitation)
- [x] Security reviewed
- [x] Works with local models
- [x] Works with cloud models
- [ ] UX completed (CLI/REST only, no dashboard card)
- [x] No TODOs remain
- [x] Code reviewed
- [x] Ready for production

**Risks:** Unbounded file growth over a long project lifetime (documented, not yet mitigated). **Dependencies:** `MemoryManager`. **Recommended Next Steps:** Pattern-extraction pass; retention window.

---

### Planner + Workflow Engine + Scheduler

**Status:** ✅ COMPLETE
**Priority:** Core

**Description**
`Planner` turns a natural-language goal into a `TaskGraph` via the active provider (JSON-mode prompt, safe single-task fallback on unparseable output). `TaskExecutor` and `WorkflowEngine` both run their respective graphs through the shared `DagExecutor`. `Scheduler` wraps `node-cron` for recurring jobs.

**Evidence**
- `planner/{planner,executor,types}.ts`, `workflow/{workflow-engine,types}.ts`, `scheduler/scheduler.ts`
- Tests: `planner/planner.test.ts`, `workflow/workflow-engine.test.ts`, `scheduler/scheduler.test.ts`
- `examples/workflows/{research-and-build,youtube-pipeline}.json`

**Completed**
- End-to-end plan→execute for arbitrary goals (`ashos.run()`)
- JSON-authored static workflows on the same executor
- Cron scheduling with event-bus notification on fire

**Remaining**
- Planner never hard-fails but also never routes through the Model Router (documented limitation)
- No persistent/distributed task queue — everything is in-process for the life of one CLI/API invocation

**Definition of Done**
- [x] Functional implementation complete
- [x] Architecture follows project standards
- [x] Integrated with existing modules
- [x] Error handling implemented
- [x] Logging added
- [x] Configuration supported
- [x] Documentation written
- [x] Unit tests added
- [x] Integration tests added
- [ ] Performance validated
- [x] Security reviewed
- [x] Works with local models
- [x] Works with cloud models
- [x] UX completed (dashboard Plan/Workflow tabs)
- [x] No TODOs remain
- [x] Code reviewed
- [x] Ready for production

**Risks:** None significant. **Dependencies:** Provider, AgentRegistry, ToolRegistry. **Recommended Next Steps:** Route the Planner itself through `ModelRouter`; a genuine verification gate (see Missing Features).

---

### Plugin System

**Status:** ✅ COMPLETE
**Priority:** Medium

**Description**
A plugin is a directory with `manifest.json` + `index.ts` exporting a `Plugin` whose `register(host)` receives tools/agents/providers/innovation-collectors. `PluginManager.loadFromDirectory` dynamically imports plugins.

**Evidence**
- `kernel/plugin-manager.ts`, `plugins/{git,shell}-plugin/{index.ts,manifest.json}`
- Tests: `kernel/plugin-manager.test.ts`
- Docs: `docs/plugin-development.md`

**Completed**
- Full load/register cycle with two working reference plugins
- `PluginHost` exposes tools/agents/providers/innovation collectors to a plugin

**Remaining**
- No registry-based plugin discovery/install (`ash plugin install <name>` only loads from local `plugins/`)
- `PluginHost` doesn't yet expose memory/router/codebase to plugins (only tools/agents/providers/innovation.collectors)

**Definition of Done**
- [x] Functional implementation complete
- [x] Architecture follows project standards
- [x] Integrated with existing modules
- [x] Error handling implemented
- [x] Logging added
- [x] Configuration supported
- [x] Documentation written
- [x] Unit tests added
- [ ] Integration tests added (only load-cycle tested, not a full end-to-end plugin-contributes-then-is-used test)
- [ ] Performance validated
- [x] Security reviewed (dynamic `import()` of local files only — no remote code execution)
- [x] Works with local models
- [x] Works with cloud models
- [ ] UX completed (N/A)
- [x] No TODOs remain
- [x] Code reviewed
- [x] Ready for production

**Risks:** Low. **Dependencies:** None. **Recommended Next Steps:** Registry-based install; broaden `PluginHost`.

---

### REST API

**Status:** ✅ COMPLETE
**Priority:** Core

**Description**
Express server exposing 38 routes across chat, planning, execution, workflows, agents/providers/tools introspection, memory, logs, Innovation Intelligence (18 routes), Local Codebase Intelligence (3 routes), and the Model Router (2 routes).

**Evidence**
- `api/server.ts` (371 lines — the single largest source file, see Technical Debt), `api/server.test.ts` (493 lines, the largest test file)
- Route count independently verified by grepping every `app.(get|post|patch)(` call: **38 routes**

**Completed**
- Every subsystem has a corresponding, tested route
- Consistent error handling (`try/catch` → `500` with message; `400` for malformed input where applicable)
- `createServer(ashos?)` pattern allows injecting a test-specific `AshOS` instance

**Remaining**
- No authentication/authorization (acceptable for a local single-user tool, but worth flagging if this is ever exposed beyond localhost)
- No rate limiting
- `server.ts` itself is large enough that further growth should probably be split into route modules

**Definition of Done**
- [x] Functional implementation complete
- [x] Architecture follows project standards
- [x] Integrated with existing modules
- [x] Error handling implemented
- [x] Logging added
- [x] Configuration supported (`ASHOS_API_PORT`)
- [x] Documentation written (`docs/api.md`)
- [x] Unit tests added
- [x] Integration tests added
- [ ] Performance validated
- [ ] Security reviewed (no auth/rate-limiting — flagged, not yet addressed)
- [x] Works with local models
- [x] Works with cloud models
- [x] UX completed (consumed by dashboard)
- [x] No TODOs remain
- [x] Code reviewed
- [x] Ready for production (for local/trusted-network use; not for public internet exposure without adding auth)

**Risks:** No auth means this should never be exposed to an untrusted network as-is. **Dependencies:** All subsystems. **Recommended Next Steps:** Split `server.ts` into route modules if it keeps growing; add auth if ever exposed beyond localhost.

---

### CLI (`ash`)

**Status:** ✅ COMPLETE
**Priority:** Core

**Description**
11 top-level command groups (`init`, `doctor`, `status`, `provider` [+ `router` subgroup], `plugin`, `plan`, `run`, `chat`, `memory`, `logs`, `innovation`, `codebase`) via Commander.js.

**Evidence**
- `cli/index.ts`, `cli/commands/*.ts` (14 files)
- Tests: `cli/cli.test.ts` (350 lines, 24 tests, all passing)

**Completed**
- Every command group has at least one passing test
- Global-install path documented and functional (`npm run build && npm link`)

**Remaining**
- Some commands that require real network (`innovation discover --live`, `innovation repo analyze`, `innovation digest`) are deliberately not covered by CLI-level tests (would require live network in CI) — covered instead by unit tests on the underlying collectors/agents plus documented manual verification

**Definition of Done**
- [x] Functional implementation complete
- [x] Architecture follows project standards
- [x] Integrated with existing modules
- [x] Error handling implemented
- [x] Logging added
- [x] Configuration supported
- [x] Documentation written (`docs/cli.md`)
- [x] Unit tests added
- [x] Integration tests added
- [ ] Performance validated
- [x] Security reviewed
- [x] Works with local models
- [x] Works with cloud models
- [x] UX completed
- [x] No TODOs remain
- [x] Code reviewed
- [x] Ready for production

**Risks:** None significant. **Dependencies:** SDK facade. **Recommended Next Steps:** None required.

---

### Dashboard

**Status:** 🟡 IN PROGRESS
**Priority:** High

**Description**
Vite + React + Tailwind v4 dashboard with 8 tabs (Dashboard, Plan, Workflow, Innovation, Trending, Memory, Logs, Chat), hand-authored shadcn/ui-style components, responsive sidebar (drawer on mobile), light/dark theming.

**Evidence**
- `dashboard/src/App.tsx` (1200 lines — see Technical Debt), `dashboard/src/api.ts` (312 lines), `dashboard/src/components/ui/*`
- Manual verification: Playwright screenshots across sessions (documented in `docs/test-report.md`), not automated

**Completed**
- All 8 tabs functional against the real REST API
- Light/dark theme, mobile-responsive drawer nav
- Innovation tab covers opportunities, collectors, radar, repository intelligence, events, brief

**Remaining**
- **Zero automated tests** (0 `*.test.*` files under `dashboard/src`) — every verification has been manual/visual
- No Model Router UI card (CLI/REST only)
- No Codebase Intelligence UI card
- `App.tsx` at 1200 lines holds every tab's component — should be split (see Technical Debt)
- No Providers/Agents/Tools tabs (deliberately removed in earlier commits as "unused UI surface" — still reachable via CLI/REST)

**Definition of Done**
- [x] Functional implementation complete
- [x] Architecture follows project standards
- [x] Integrated with existing modules
- [x] Error handling implemented (`LoadError`/`EmptyState` components)
- [ ] Logging added (N/A client-side)
- [x] Configuration supported (proxies `/api` to the backend)
- [x] Documentation written
- [ ] Unit tests added — **none exist**
- [ ] Integration tests added — **none exist**
- [ ] Performance validated
- [x] Security reviewed (no secrets handled client-side)
- [x] Works with local models (backend-agnostic)
- [x] Works with cloud models
- [x] UX completed for what's built
- [x] No TODOs remain
- [x] Code reviewed
- [ ] Ready for production (functionally yes; testing gap is real)

**Risks:** No regression safety net beyond manual visual checks — a future change could silently break a tab. **Dependencies:** REST API. **Recommended Next Steps:** Split `App.tsx` into per-tab files; add at minimum smoke tests (e.g. Vitest + React Testing Library, or a scripted Playwright suite) — currently the single biggest testing gap in the project.

---

### Innovation Intelligence (Opportunity Discovery)

**Status:** ✅ COMPLETE
**Priority:** High

**Description**
Continuous opportunity-discovery pipeline: one `IntelligenceAgent` per domain (market/github/community/research/workflow/competitor) → `KnowledgeGraph` → `OpportunityEngine` (tag-overlap merge) → `ScoringEngine` (15 dimensions) → `BuilderProfileStore` → `DailyBriefGenerator`.

**Evidence**
- `innovation/{opportunity,history,profile,brief,lifecycle.ts}*`, `innovation/agents/intelligence-agent.ts`
- Tests across all of the above (part of 54 files under `innovation/`)
- Docs: `docs/innovation.md`

**Completed**
- Full pipeline, offline-by-default (deterministic mock collectors)
- 15-dimension scoring with cost-dimension inversion
- Idea lifecycle state machine (captured → ... → released, archive/revive)
- Daily Brief generation with graceful offline fallback

**Remaining**
- `BuilderProfileStore.reinforce()` (the Learning Loop's outcome-feedback hook) has no automatic caller
- No automatic project/task scaffolding when an opportunity is accepted
- No Weekly/Monthly report (only Daily)

**Definition of Done**
- [x] Functional implementation complete
- [x] Architecture follows project standards
- [x] Integrated with existing modules
- [x] Error handling implemented
- [x] Logging added
- [x] Configuration supported
- [x] Documentation written
- [x] Unit tests added
- [x] Integration tests added
- [ ] Performance validated
- [x] Security reviewed
- [x] Works with local models
- [x] Works with cloud models
- [x] UX completed (dashboard Innovation tab)
- [x] No TODOs remain
- [x] Code reviewed
- [x] Ready for production

**Risks:** None significant for the offline default. **Dependencies:** Providers, Memory, Knowledge Graph. **Recommended Next Steps:** Wire `reinforce()` to a real outcome signal (a natural pairing with Outcome Memory, above); Weekly/Monthly reports.

---

### Event Normalization & Deduplication

**Status:** ✅ COMPLETE
**Priority:** Medium

**Description**
Canonical, deduplicated `IntelligenceEvent` layer between raw signals and opportunities — Jaccard similarity over title/tags, optimistic confidence combination across corroborating sources.

**Evidence**
- `innovation/events/{types,normalizer,event-store}.ts` + tests

**Completed:** Full normalize/dedupe/merge pipeline, exposed via `ash innovation events` / `GET /innovation/events`.
**Remaining:** None for current scope.

**Definition of Done:** All applicable boxes checked — [x] implementation, [x] integration, [x] tests, [x] docs, [x] error handling, [x] no TODOs. Not applicable: UX (data-layer only, surfaced through the Innovation tab), performance load-testing.

**Risks:** None. **Dependencies:** None beyond `innovation/types.ts`.

---

### Repository Intelligence (External)

**Status:** ✅ COMPLETE
**Priority:** High

**Description**
`RepositoryAnalystAgent` analyzes external GitHub repositories via the real API (languages, contributors via `Link`-header pagination, `package.json` dependencies, license, maintenance status) with `pushed_at`-based caching so expensive calls are never repeated unnecessarily.

**Evidence**
- `innovation/repository/{types,repository-profile-store}.ts`, `innovation/agents/repository-analyst-agent.ts` (203 lines, the second-largest source file) + 207-line test file (the largest agent test)
- Verified live against `ollama/ollama` (177,546★, MIT, Go, 15 languages) earlier in this project's history

**Completed:** Full real-API analysis + caching + 4 deterministic heuristic scores + AshOS-compatibility note.
**Remaining:** None for stated scope; richer graph integration (repo as a first-class knowledge-graph node) is future work tied to the General Knowledge Graph gap.

**Definition of Done:** [x] implementation, [x] integration, [x] error handling, [x] logging, [x] config, [x] docs, [x] unit tests, [x] integration tests, [x] security (real network calls handled gracefully on 403/404), [x] works with local/cloud models, [x] no TODOs, [x] code reviewed, [x] production ready. [ ] performance validated at scale (fine for one-at-a-time analysis, untested for bulk).

**Risks:** GitHub secondary rate limiting on rapid repeated calls (confirmed real, handled gracefully — returns an error result, doesn't crash). **Dependencies:** Real network access to `api.github.com`.

---

### Local Codebase Intelligence

**Status:** ✅ COMPLETE (for its stated v1 scope)
**Priority:** High

**Description**
Indexes the actual local working repository — file tree, per-file language, lightweight regex-based symbol extraction (TypeScript/JavaScript/Python/Go) — cached and invalidated by git commit hash.

**Evidence**
- `codebase/{types,indexer,codebase-store}.ts`, `codebase/agents/codebase-analyst-agent.ts`
- `cli/commands/codebase.ts`, 3 REST routes
- Tests: `codebase/indexer.test.ts`, `codebase/codebase-store.test.ts`, `codebase/agents/codebase-analyst-agent.test.ts` (uses real `git init`/`commit` in temp dirs, not mocked)
- Verified live against AshOS's own repository: 194 files, 18 modules, real symbol search (`EventBus` → `kernel/event-bus.ts:45`)
- Docs: `docs/codebase-intelligence.md`

**Completed**
- Full scan/extract/cache/search pipeline
- Git-commit-hash cache invalidation (with documented non-git-repo fallback: always rescans)
- Deterministic substring search, symbol-name matches ranked first

**Remaining**
- No semantic/embedding-based search (substring only)
- No cross-file relationship tracking (imports, call graphs) — this is explicitly the natural extension point for the General Knowledge Graph gap
- No file-watching/auto-reindex trigger

**Definition of Done**
- [x] Functional implementation complete
- [x] Architecture follows project standards
- [x] Integrated with existing modules
- [x] Error handling implemented
- [x] Logging added
- [x] Configuration supported
- [x] Documentation written
- [x] Unit tests added
- [x] Integration tests added
- [ ] Performance validated at very large repo scale (fine at AshOS's own ~200-file scale)
- [x] Security reviewed (local filesystem only, no network)
- [x] Works with local models (doesn't need a model at all — deterministic)
- [x] Works with cloud models
- [ ] UX completed (CLI/REST only, no dashboard card yet)
- [x] No TODOs remain
- [x] Code reviewed
- [x] Ready for production

**Risks:** None significant. **Dependencies:** `git` CLI (optional — falls back gracefully). **Recommended Next Steps:** Dashboard card; embedding-based search; graph integration.

---

### Technology Radar

**Status:** ✅ COMPLETE
**Priority:** Medium

**Description**
Classifies every `technology` knowledge-graph node into emerging/growing/stable/declining/obsolete via a deterministic, evidence-based heuristic (no LLM).

**Evidence**
- `innovation/radar/{types,classify,radar-store}.ts`, `innovation/agents/technology-radar-agent.ts` + tests
- Verified live via CLI

**Completed:** Full classification pipeline with transparent evidence per entry.
**Remaining:** None for current scope; richer entity types feed it once the Knowledge Graph gap closes.

**Definition of Done:** All applicable boxes checked (implementation, integration, tests, docs, error handling, security, no TODOs, production ready). Not applicable: dashboard card exists; performance untested at very large graph scale.

**Risks:** None. **Dependencies:** `KnowledgeGraph` population (currently only `problem`/`technology` nodes exist).

---

### Real Collectors (GitHub / HN / Reddit / arXiv / Hugging Face)

**Status:** 🟡 IN PROGRESS
**Priority:** Medium

**Description**
Five real, opt-in, network-backed `Collector` implementations feeding the Daily AI News Digest and live discovery.

**Evidence**
- `innovation/collectors/{github-releases,hn,reddit,arxiv,huggingface}-collector.ts`, all fully unit-tested with `vi.stubGlobal("fetch", ...)`
- **Live verification is partial**: this session's network sandbox only allowlists `api.github.com` (confirmed via the egress proxy's `connect_rejected` diagnostics for `hn.algolia.com`, `www.reddit.com`, `export.arxiv.org`, `huggingface.co`) — so only `github-live` has been proven to return real data; the other four are real, tested code that has never actually round-tripped against the live internet in this environment

**Completed:** All five collectors implemented, isolated (`runLiveDiscovery`'s per-source try/catch), unit-tested.
**Remaining:** Live verification of HN/Reddit/arXiv/Hugging Face requires an unrestricted network environment — this is an environment constraint, not unfinished code, but it means the claim "5 real collectors" is code-complete, not field-proven, for 4 of the 5.

**Definition of Done**
- [x] Functional implementation complete
- [x] Architecture follows project standards
- [x] Integrated with existing modules
- [x] Error handling implemented
- [ ] Logging added (basic event emission exists; no per-source success/failure metrics dashboard)
- [x] Configuration supported
- [x] Documentation written
- [x] Unit tests added
- [ ] Integration tests added — **only against mocked fetch**, not live for 4 of 5 sources
- [ ] Performance validated
- [x] Security reviewed
- [ ] Works with local models (N/A — these don't use an LLM)
- [x] Works with cloud models (N/A — same)
- [ ] UX completed (CLI/REST only)
- [x] No TODOs remain
- [x] Code reviewed
- [ ] Ready for production (GitHub yes; the other four are unverified in the wild)

**Risks:** A live API shape change (e.g. Reddit or HN changing their JSON schema) wouldn't be caught until first real use, since there's no live test. **Dependencies:** Outbound network access to each source. **Recommended Next Steps:** Run once from an unrestricted environment to confirm each of the four untested collectors actually works against the real API.

---

### Knowledge Graph (General-Purpose)

**Status:** ✅ COMPLETE (for its stated v1 scope)
**Priority:** High

**Description**
`KnowledgeGraph` was moved from `innovation/graph/` to a shared top-level `graph/` package and given an optional `namespace`, so one class now backs both Innovation Intelligence's original graph (`{ namespace: "innovation" }`, unchanged file path `.ashos/innovation/graph.json`) and a new general-purpose instance (`AshOS.knowledgeGraph`, `.ashos/graph.json`).

**Evidence**
- `graph/{types,knowledge-graph}.ts` (moved via `git mv`, namespace-aware), `graph/knowledge-graph.test.ts`
- `agents/base-agent.ts`'s `recordGraphActivity()` — every `BaseAgent.execute()` call upserts `project`/`agent`/`task` nodes and `produced-by`/`part-of` edges into `context.graph` when present, for every agent, with no per-agent code changes
- `codebase/agents/codebase-analyst-agent.ts`'s `enrichProjectNode()` — additionally attaches real language/module data to the same project node
- `sdk/ashos.ts` — `AshOS.knowledgeGraph = new KnowledgeGraph(this.kernel.root)` (no namespace), passed into `agentContext().graph`
- `cli/commands/graph.ts` (`ash graph stats/nodes/neighbors`), 3 REST routes (`/graph`, `/graph/nodes`, `/graph/nodes/:id/neighbors`)
- Verified live: the same project node accumulates data from two independently-run agents across separate invocations, confirming merge-not-duplicate identity via `upsertNode`'s dedup-by-(kind,label)
- Docs: `docs/knowledge-graph.md`

**Completed:** Namespace-based generalization with zero data migration for Innovation's own graph; automatic population by every agent via `BaseAgent`; codebase-data enrichment; CLI/REST query surface.
**Remaining:** No `repository` nodes yet (external-repo analysis doesn't write into either graph instance), no decision/doc node kinds, no dashboard visualization, no cross-file relationship tracking — see `docs/knowledge-graph.md`'s "What's not implemented."

**Definition of Done**
- [x] Functional implementation complete
- [x] Architecture follows project standards
- [x] Integrated with existing modules (`BaseAgent`, `CodebaseAnalystAgent`, `AshOS` facade)
- [x] Error handling implemented
- [x] Logging added
- [x] Configuration supported
- [x] Documentation written (`docs/knowledge-graph.md`)
- [x] Unit tests added
- [x] Integration tests added (cross-agent node-merging verified live)
- [ ] Performance validated
- [x] Security reviewed
- [x] Works with local models
- [x] Works with cloud models
- [ ] UX completed (no dashboard visualization yet — CLI/REST only)
- [x] No TODOs remain
- [ ] Code reviewed
- [ ] Ready for production

**Risks:** None significant — best-effort writes wrapped in try/catch so a graph failure never breaks an agent's actual task. **Dependencies:** None new (reuses the existing class). **Recommended Next Steps:** Dashboard graph visualization; `repository`-kind nodes from `RepositoryAnalystAgent`.

---

### Multi-Agent Specialist Roles

**Status:** 🟡 IN PROGRESS
**Priority:** High

**Description**
The North Star vision names 11 specialist roles (Architect, Planner, Researcher, Developer, Reviewer, Tester, Documentation Writer, Security Auditor, DevOps Engineer, UI Designer, Video Creator). Today, AshOS has generic-purpose equivalents for some (Code≈Developer, Research≈Researcher, Testing≈Tester, Planner exists as infrastructure not an agent) but no dedicated Reviewer, Security Auditor, DevOps Engineer, UI Designer, Architect, or Video Creator agent.

**Evidence**
- `agents/{code,research,testing}-agent.ts` exist; grepping every agent's `name =` field (15 total) confirms none of the missing six exist anywhere in the tree

**Completed:** 5 of 11 named roles have a reasonable existing equivalent.
**Remaining:** 6 roles have no agent at all. Five of them (Reviewer, Security Auditor, DevOps Engineer, UI Designer, Architect) need no new tools/providers — they're achievable today as role-specific prompts over existing tools, per this project's own `docs/roadmap-v2.md` Tier 2 analysis. The sixth (Video Creator) needs entirely new media-generation infrastructure and is explicitly out of scope per that same document.

**Definition of Done**
- [ ] Functional implementation complete — 0 of 6 missing agents built
- [x] Architecture follows project standards (the pattern to follow already exists)
- [ ] Integrated with existing modules
- [ ] Error handling implemented
- [ ] Logging added
- [ ] Configuration supported
- [ ] Documentation written
- [ ] Unit tests added
- [ ] Integration tests added
- [ ] Performance validated
- [ ] Security reviewed
- [ ] Works with local models
- [ ] Works with cloud models
- [ ] UX completed
- [x] No TODOs remain (there's no half-finished code — it simply doesn't exist)
- [ ] Code reviewed
- [ ] Ready for production

**Risks:** None technical — this is pure backlog. **Dependencies:** None new. **Recommended Next Steps:** Build Reviewer, Security Auditor, DevOps Engineer, UI Designer, Architect (5 agents, same `BaseAgent` pattern, no new tools). Defer Video Creator.

---

### Verification Gate

**Status:** ✅ COMPLETE
**Priority:** High

**Description**
North Star goal #1 ("Become an AI Employee") explicitly requires AshOS to "verify results," not just execute and report success. `TaskExecutor` now makes verification a *required* step after every code-producing task, not something that only runs if the Planner's LLM output happens to include a testing task.

**Evidence**
- `planner/executor.ts` — exports `CODE_PRODUCING_CAPABILITIES` (`["code"]`) and `VERIFICATION_CAPABILITY` (`"verify"`); inside the DAG node's `run()` closure, right after the primary agent succeeds, a `"code"`-capability task runs `this.verify(task.id, task.title)`, which looks up the registered `"verify"`-capability agent (`TestingAgent` by default) via `AgentRegistry.findByCapability` and throws on failure — the throw happens inside the same closure `DagExecutor` already retries on, so retry/fail/skip-dependents semantics apply with zero changes to `kernel/dag.ts`
- `kernel/event-bus.ts` — `task:verified`/`task:verification-failed` events added
- `planner/executor.test.ts` (new, 6 tests) — verification runs and passes; verification runs and fails (task fails with the verification error, `attempts` reflects the retry); non-code capabilities skip verification; a missing verify-capable agent no-ops instead of failing; `verify: false` disables the gate entirely
- Live-verified outside the test suite: a real `TaskExecutor` wired to real `CodeAgent`/`TestingAgent`/`ShellTool`/`FsTool` against a throwaway temp git repo — success case emitted `task:verified` and returned `status: "success"`; flipping the repo's `npm test` script to `exit 1` produced `task:verification-failed`, `attempts: 2` (one retry), and `status: "failed"` with an error distinguishing "verification failed" from "agent failed"
- Confirmed safe against the existing suite: `Planner.plan()`'s fallback (used by every test, since `MockProvider`'s echo response is never parseable JSON) always emits capability `"generic"`, never `"code"` — so the gate never fires during `npm test` itself; the full 331-test suite passes with the gate on by default

**Completed:** Full implementation, tests, live verification, docs (`docs/verification-gate.md`).
**Remaining:** Nothing for the scope defined by goal #1's "verify results." Optional future extension: a dedicated `ReviewerAgent` also registered under `"verify"` (Tier 2 of `docs/roadmap-v2.md`), and verification for non-code capabilities.

**Definition of Done**
- [x] Functional implementation complete
- [x] Architecture follows project standards
- [x] Integrated with existing modules
- [x] Error handling implemented
- [x] Logging added
- [x] Configuration supported (`verify: false` opt-out)
- [x] Documentation written (`docs/verification-gate.md`)
- [x] Unit tests added
- [x] Integration tests added (live temp-repo verification, both pass and fail paths)
- [ ] Performance validated
- [ ] Security reviewed
- [x] Works with local models (agent-agnostic — no provider call in the gate itself)
- [x] Works with cloud models (same)
- [ ] UX completed (no dashboard surface for verification events yet — visible only via `ash logs`/event bus)
- [x] No TODOs remain
- [ ] Code reviewed
- [ ] Ready for production

**Risks:** None significant — the gate is additive and off-switchable, and no-ops safely when no verifier is registered. **Dependencies:** `TestingAgent` (exists), `TaskExecutor` (modified). **Recommended Next Steps:** Optional — dashboard surfacing of `task:verified`/`task:verification-failed`; a `ReviewerAgent` for code-quality checks beyond test-suite pass/fail.

---

### Self-Improvement / Evaluation Framework (Evolution Engine)

**Status:** 🔴 NOT IMPLEMENTED (previously existed, deliberately removed)
**Priority:** High (per the user's own North Star goals #9/#10/#14, but explicitly gated on a decision — see below)

**Description**
A prior version of this repository had a full "Evolution Engine" subsystem: mutation engine, real git-worktree execution pipeline, evaluator + benchmark framework, observer/researcher (LLM hypothesis generation), GPU/resource metrics collection, scheduler integration, REST/CLI/dashboard surfaces, and its own plugin. It was removed in its entirety.

**Evidence**
- `git log --diff-filter=D` confirms commit `8f7400b` ("Remove Evolution Engine") deleted `evolution/{benchmark,engine}/*`, `docs/evolution.md`, and related dashboard/CLI/API code
- `evolution/` currently exists as an **empty directory** containing only an empty `dashboard/` subfolder — confirmed via `ls -la` (technical debt, see below)
- `docs/PRD.md` line 6 already acknowledges the removal; `docs/roadmap-v2.md` explicitly flags that three of the user's fifteen North Star goals (#9 "iterate", #10 "learn from mistakes", #14 "benchmark/optimize/self-improve") point back at this exact removed territory

**Completed:** N/A — nothing currently exists.
**Remaining:** Everything, **pending an explicit decision from the user** (documented in `docs/roadmap-v2.md`'s "A decision that needs to be made explicitly" section): either rebuild a leaner version purpose-built for goals #9/#10/#14, or treat those three goals as aspirational until the Tier 1 staged plan finishes.

**Definition of Done**
- [ ] Functional implementation complete
- [ ] Architecture follows project standards
- [ ] Integrated with existing modules
- [ ] Error handling implemented
- [ ] Logging added
- [ ] Configuration supported
- [ ] Documentation written
- [ ] Unit tests added
- [ ] Integration tests added
- [ ] Performance validated
- [ ] Security reviewed
- [ ] Works with local models
- [ ] Works with cloud models
- [ ] UX completed
- [x] No TODOs remain (cleanly removed, not half-finished)
- [ ] Code reviewed
- [ ] Ready for production

**Risks:** Rebuilding without care could reintroduce the same scope that led to removal. **Dependencies:** A user decision (not a technical blocker). **Recommended Next Steps:** Do not build until the user explicitly chooses a direction — this is the one feature in this report gated by a decision rather than by effort.

---

## Missing Features

| Feature | Priority | Est. Complexity | Dependencies | Reason Missing |
|---|---|---|---|---|
| MCP client support | Medium | Medium | None new | Not yet prioritized; would be the standardized alternative to hand-building Docker/browser tools one at a time |
| Browser automation (Playwright) | Low | Medium | `playwright` dependency | Explicitly deferred in `docs/roadmap.md` since project inception |
| Docker as an agent Tool | Low | Low-Medium | Docker daemon access | Explicitly deferred; only deployment-time Docker exists |
| Generic Web Search/Fetch Tool | Medium | Low | None new | `ResearchAgent` currently reasons model-only; no tool for arbitrary live lookups |
| Reviewer / Security Auditor / DevOps / UI Designer / Architect agents | High | Low each | None new | Backlog item, no technical blocker — see "Multi-Agent Specialist Roles" above |
| Self-Improvement / Evaluation Framework | High (conditional) | High | User decision required | Deliberately removed, rebuild gated on user choice |
| Authentication | Low | Medium | An auth library | Not needed for current single-user local-tool scope; would be required before any multi-user or public deployment |
| Creative Studio (image/video/voice generation) | Low | High | New provider types entirely | Deliberately deprioritized — least aligned with "local-first, free APIs," most commoditized space |
| Personal OS features (calendar/finance/home-server) | Low | High | Entirely new integrations | Deliberately flagged as scope-creep risk against AshOS's developer-focused identity |
| Weekly/Monthly Innovation reports | Low | Low | `DailyBriefGenerator` pattern | Only the daily cadence has been built so far |
| Product Hunt collector | Low | Low | Same `Collector` pattern as existing 5 | Not yet built; explicitly named in the original Innovation Engine goal |
| Dashboard automated tests | High | Medium | Testing framework choice (Vitest+RTL or Playwright) | Never built — biggest testing gap in the project |

---

## Technical Debt

- **`evolution/` is an empty directory** containing only an orphaned empty `dashboard/` subfolder — a leftover from the Evolution Engine removal that was never cleaned up. Low risk, but should be deleted or the git history should be trusted instead of a dangling empty path.
- **`tests/` is an empty directory** at the repo root — appears to have been scaffolded early on and never used; every real test is colocated as `*.test.ts` next to its source, which is the pattern actually documented in `CLAUDE.md`. This directory is dead weight.
- **`dashboard/src/App.tsx` is 1200 lines** holding all 8 tab components in one file. It works, but any further growth should be split into per-tab component files — this is the largest single maintainability risk in the frontend.
- **Zero dashboard automated tests.** Every dashboard change in this project's history has been verified via manual Playwright screenshots, not a repeatable test suite. This is the single biggest test-coverage gap.
- **4 of 5 real Innovation collectors are unverified against live APIs** in this development environment (network-sandboxed to `api.github.com` only) — real, tested-against-mocks code, but never proven against the actual internet.
- **`api/server.ts` at 371 lines** is a single growing file for all 38 routes. Not yet a problem, but the natural next refactor if more routes are added is splitting into per-domain route modules (`routes/innovation.ts`, `routes/codebase.ts`, etc.).
- **No authentication anywhere.** Fine for the current local-tool scope; would need to be addressed before any non-localhost deployment.
- **`MemoryManager`'s project/global scopes do a full read-modify-write of the entire JSON file on every single write** (including every Outcome Memory record now generated on every agent task). This is documented as an accepted tradeoff at current scale but will need a retention policy or a different storage strategy if task volume grows significantly.
- **No TODO/FIXME comments exist in the codebase** (0 found by grep) — this is actually a positive signal (no known-but-unaddressed shortcuts left behind), not debt, but noted here since the audit explicitly asked to search for them.

---

## Suggested Development Order

**Phase 1 (already done):** Kernel, Providers, Tools, Agents, Memory, Planner/Workflow/Scheduler, CLI, REST API, Dashboard, Plugin System.

**Phase 2 (already done):** Innovation Intelligence, Event Normalization, Repository Intelligence (external), Local Codebase Intelligence, Technology Radar, Model Router, Outcome Memory.

**Phase 3a (already done — North Star Tier 1, Stages 1-5):** Local Codebase Intelligence, Model Router, Outcome Memory, General Knowledge Graph population, Verification Gate in `TaskExecutor`. This closes v2 to ~97%.

**Phase 3b (next — v2's remaining gap and into v3/v4):**
1. Reviewer, Security Auditor, DevOps Engineer, UI Designer, Architect agents (closes Multi-Agent Collaboration, v2's last gap)
2. Generic Web Search/Fetch tool + generalize `ResearchAgent` (closes Autonomous Research beyond AI-ecosystem scope)

**Phase 4 (self-optimization, pending user decision):**
5. Decide on Evolution Engine revival (or formally defer goals #9/#10/#14)
6. Pattern-extraction pass over Outcome Memory (feeds Continuous Learning)
7. MCP client support

**Phase 5 (explicitly deprioritized, build only on request):**
8. Creative Studio, Personal OS features, Weekly/Monthly reports, Product Hunt collector, Dashboard automated tests (this last one should honestly move earlier if the dashboard keeps changing — flagged as high-priority despite being listed last here for milestone-sequencing reasons)

---

## Metrics

| Metric | Value |
|---|---|
| Total source files (backend, non-test, non-dashboard) | 106 |
| Total backend source lines (non-test) | 6,738 |
| Total test files | 49 |
| Total test lines | 4,842 |
| Total tests passing | 331 / 331 |
| Statement coverage | 84.51% |
| Branch coverage | 82.49% |
| Function coverage | 86.02% |
| Dashboard files (`.ts`/`.tsx`) | 16 |
| Dashboard lines | 2,015 |
| Dashboard automated tests | 0 |
| Documentation files (`docs/*.md`) | 14 |
| Documentation lines | 2,337 |
| TODO comments | 0 |
| FIXME comments | 0 |
| Registered agents | 15 |
| REST API routes | 43 |
| CLI command groups | 11 |
| Languages | TypeScript (backend + dashboard), JSON (config/manifests/workflows), Markdown (docs) |
| Largest source file | `api/server.ts` (371 lines) |
| Largest test file | `api/server.test.ts` (493 lines) |
| Largest dashboard file | `dashboard/src/App.tsx` (1,200 lines) |

---

## Overall Project Score

| Category | Score | Justification |
|---|---|---|
| Architecture | 9/10 | Consistently layered (kernel → providers/tools/agents → planner/workflow → SDK → CLI/API), every new subsystem follows established patterns exactly (registries, JSON-file-per-record stores, capability routing). `KnowledgeGraph` is now genuinely unified (namespace-aware, one class backing both Innovation's and the general-purpose instance) — the gap that held this category back is closed. |
| Code Quality | 8/10 | Zero TODO/FIXME debt, consistent error handling, strict TypeScript throughout, no unnecessary dependencies. Loses points for two oversized files (`App.tsx`, `server.ts`) that should be split before they grow further. |
| Scalability | 6/10 | Fine for its actual target (single user/small team, local-first). JSON-file-per-scope persistence with full read-modify-write on every memory write (now amplified by automatic Outcome Memory on every task) is an honest, documented scaling limit, not a hidden one. |
| Maintainability | 8/10 | Extremely consistent conventions documented in `CLAUDE.md`, colocated tests, no dead abstractions found. Two empty leftover directories (`evolution/`, `tests/`) and the two oversized files are the only real maintainability drags found. |
| Documentation | 9/10 | 14 markdown docs (plus this file), each subsystem has either a dedicated doc or a clear section in `docs/architecture.md`; `docs/roadmap.md`/`docs/roadmap-v2.md` are unusually honest about what's NOT built. Loses one point for `MemoryManager` lacking its own dedicated doc. |
| Testing | 8/10 | 331 passing tests, 84.5% statement coverage, real (not mocked) git/filesystem operations used where feasible, plus a live (non-suite) verification of the new Verification Gate's pass and fail paths. Loses two points for the dashboard's zero automated test coverage — the single most significant gap found in this audit. |
| Production Readiness | 7/10 | Solid for a local developer tool: CI green, Docker deployment path exists, no crashes found, and code-producing tasks are now verified before being reported done rather than trusted blindly. Not ready for any multi-user/public deployment: zero authentication, no rate limiting, and several "real" integrations (4 of 5 collectors) have never been proven against a live network. |
| **Overall** | **78/100** | A genuinely well-built, well-tested system for its actual current scope (local-first, single-user AI agent platform), with clearly documented and honestly-scoped gaps rather than hidden or overstated ones. All five North Star Tier 1 stages (Codebase Intelligence, Model Router, Outcome Memory, General Knowledge Graph, Verification Gate) are now shipped, closing v2 to ~97%. The score is held back primarily by the dashboard's testing gap, the still-partial Multi-Agent Collaboration roster (5 of 11 named roles), and the intentionally-paused self-improvement subsystem. |

---

## Next Milestone

**Recommended single highest-impact milestone: named specialist agents (Reviewer, Security Auditor, DevOps Engineer, UI Designer, Architect).**

**Why it matters:** With the Verification Gate and General Knowledge Graph now both shipped, this is v2's one remaining named gap (goal #5, Multi-Agent Collaboration) — closing it would put v2 at essentially 100% on the user's own milestone scale. Each of the five needs no new tools or providers: they're role-specific system prompts over the existing `BaseAgent`/`CodeAgent`-style pattern, registered under new capabilities (`review`, `security-audit`, `devops`, `ui-design`, `architecture`). A `ReviewerAgent` in particular composes naturally with the Verification Gate just shipped — it could register under `VERIFICATION_CAPABILITY` alongside `TestingAgent` for a richer "does this actually look right," not just "does it pass," check.

**Dependencies:** None new — reuses `BaseAgent`, `AgentRegistry`, existing tools (shell/git/fs), and the active provider. No user decision required (unlike the Evolution Engine question).

**Estimated effort:** Low-to-medium per agent — each is a `BaseAgent` subclass with a role-specific prompt and `capabilities` array, plus registration in `sdk/ashos.ts` and tests following the existing `agents/agents.test.ts` pattern.

**Expected outcome:** A goal that the Planner decomposes into review/security/devops/design/architecture tasks has a real specialist to route to instead of falling back to the generic Code/Research agents — closing the last named gap in v2 and materially advancing v3's "autonomous execution of complex projects."

**Definition of Done**
- [ ] `ReviewerAgent`, `SecurityAuditorAgent`, `DevOpsAgent`, `UIDesignerAgent`, `ArchitectAgent` each exist as `BaseAgent` subclasses with distinct `capabilities`
- [ ] Each is registered by default in `sdk/ashos.ts`'s `AgentRegistry`
- [ ] `ReviewerAgent` optionally registers under `VERIFICATION_CAPABILITY` alongside `TestingAgent` so the Verification Gate can pick either/both
- [ ] Full unit test coverage for all five, following `agents/agents.test.ts`'s existing pattern
- [ ] `docs/roadmap-v2.md` goal #5 and Tier 2 item #6 marked shipped
