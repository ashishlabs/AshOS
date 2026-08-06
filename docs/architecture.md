# AshOS Architecture

```
                    User
                      │
          ┌───────────┴───────────┐
          │                       │
      CLI (ash)             Dashboard (Vite/React)
          │                       │
          └───────────┬───────────┘
                       │
                REST API (express)
                       │
                  SDK facade (AshOS)
                       │
 ┌─────────────────────────────────────────────┐
 │ Kernel: EventBus, Logger, PermissionManager, │
 │ PluginManager, AgentRouter, ContextManager,  │
 │ DagExecutor, Config                          │
 └─────────────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
  AI Providers      Tools          Agents
 (anthropic/openai/  (shell/git/   (code/research/
  ollama/mock)        fs/...)       git/testing/generic)
        │
   Planner (goal → task graph) ──▶ TaskExecutor (DagExecutor)
   Workflow Engine (JSON workflow) ──▶ same DagExecutor
   Scheduler (cron) ──▶ triggers planner/workflow runs
   Memory (short-term/session/project/global + vector search)
   Innovation Intelligence (collect signals → knowledge graph → merge into
     opportunities → score → Daily Brief)
```

## Package layout

| Path | Responsibility |
|---|---|
| `kernel/` | Composition root + cross-cutting primitives: event bus, logger, permission gate, plugin loader, agent router, context manager, generic DAG executor, config load/save. |
| `providers/` | `AIProvider` interface plus Anthropic, OpenAI, Ollama, LM Studio (OpenAI-compatible, local) and Mock implementations, a registry that resolves the active one from config/env, and `ModelRouter` (opt-in, off by default) for task-aware provider selection — see `docs/model-router.md`. |
| `tools/` | `Tool` interface plus shell, git, filesystem, and web-fetch tools, each declaring capabilities/requirements/permissions and a health check. `WebFetchTool` (capability `web-fetch`) fetches a URL and extracts its readable text — http(s) only, private/loopback/link-local addresses blocked after DNS resolution, no redirects followed, timeout + size caps — used by the Inbox's AI summarizer (`docs/inbox.md`) and available to any agent via `context.tools.get("web-fetch")`. |
| `memory/` | `MemoryManager` unifying short-term (in-process, TTL), session (in-process), project (`.ashos/memory/project.json`) and global (`~/.ashos/memory/global.json`) scopes, backed by a brute-force cosine-similarity `VectorStore` for semantic recall. Every agent task's attempt is auto-recorded here as a `TaskOutcome` (`agents/outcome.ts`) via `BaseAgent.execute()`, with no opt-in needed — see `docs/outcome-memory.md`. |
| `agents/` | `Agent` interface plus Code, Research, Git, Testing, Generic, GitHub Trending, Reflection, and five named specialist agents (Reviewer, Security Auditor, DevOps, UI Designer, Architect — `docs/roadmap-v2.md` goal #5), routed by capability tag. `reflection.ts` (pure Outcome Memory/Inbox/Knowledge Graph summarization, unit tested independently) + `reflection-agent.ts` (`ReflectionAgent`, capability `reflection`) generate a daily/weekly/monthly review narrative — same shape as Innovation's `DailyBriefGenerator` — reused for `ash reflect` / `GET /reflect`. The five specialists (`reviewer-agent.ts`, `security-auditor-agent.ts`, `devops-agent.ts`, `ui-designer-agent.ts`, `architect-agent.ts`) follow the exact `CodeAgent` shape — a role-specific system prompt over `context.provider.chat()`, with an optional `task.input.file` to read (Reviewer/Security Auditor, for context) or write (DevOps/UI Designer/Architect, for the produced artifact) via the `fs` tool — reachable through the Planner, a workflow step (`agent:review`, `agent:security-audit`, ...), or `AshOS.runAgent()` directly, the same as every other general-purpose agent. |
| `planner/` | `Planner` turns a natural-language goal into a `TaskGraph` via the active provider (JSON-mode prompt with a safe single-task fallback); `TaskExecutor` runs the graph through the shared `DagExecutor`, and — the Verification Gate, `docs/verification-gate.md` — runs the registered `verify`-capability agent immediately after a code-producing task succeeds, inside the same DAG node, so a verification failure retries/fails the task exactly like the original agent failing. |
| `workflow/` | `WorkflowEngine` executes user-authored JSON workflow definitions (chains of `agent:<capability>` / `tool:<name>` steps) through the same `DagExecutor`. |
| `scheduler/` | Cron-based `Scheduler` (via `node-cron`) for recurring automation, e.g. "every morning, check GitHub, summarize, email report". |
| `innovation/` | Innovation Intelligence — continuous opportunity discovery, and the foundation of "AshOS Intelligence" (`docs/ashos-intelligence.md`). `collectors/` (pluggable signal sources: mock by default per domain, plus a real opt-in GitHub Search API collector), `events/` (canonical `IntelligenceEvent` normalization + Jaccard-similarity dedup, sitting between raw signals and opportunities), `agents/` (one `IntelligenceAgent` per domain, plus `RepositoryAnalystAgent` and `TechnologyRadarAgent`), `graph/` (JSON-backed `KnowledgeGraph`), `opportunity/` (`ScoringEngine`, `OpportunityEngine` merging signals into ranked opportunities), `history/` (JSON opportunity store), `repository/` (cached `RepositoryProfile` store — structured, real-API repo analysis of **external** GitHub repos), `radar/` (Technology Radar classification + store), `profile/` (learned Builder Profile), `brief/` (Daily Innovation Brief), `lifecycle.ts` (idea state machine). See `docs/innovation.md` for what's implemented and `docs/ashos-intelligence.md` for the full architecture and roadmap. |
| `codebase/` | Local Codebase Intelligence — indexes the actual **local** working repository (file tree, per-file language, lightweight regex-based symbol extraction), cached and invalidated by git commit hash, so an agent can answer "where does X live" without re-scanning every time. `indexer.ts` (pure scan/extract/search functions), `codebase-store.ts` (JSON-per-repository cache), `agents/codebase-analyst-agent.ts` (`CodebaseAnalystAgent`, capability `codebase-analyst`). Deliberately distinct from `innovation/repository/`, which analyzes external repos via the GitHub API instead of the local filesystem. See `docs/codebase-intelligence.md`. |
| `graph/` | `KnowledgeGraph` — domain-agnostic node/edge store, moved here from `innovation/graph/` so it can back both Innovation Intelligence's own namespaced graph (`{ namespace: "innovation" }`, unchanged file location) and the General Knowledge Graph (`AshOS.knowledgeGraph`, no namespace, `.ashos/graph.json`) connecting Projects/Agents/Tasks — see `docs/knowledge-graph.md`. |
| `inbox/` | Universal Inbox — the single capture point for text/URLs (github repo/YouTube/tweet/pdf/article, auto-classified deterministically, no network/LLM call). `InboxManager` has no persistence engine of its own: items are `MemoryManager` project-scope records tagged `inbox`, reusing the existing JSON store instead of adding a new one, and best-effort enrich `AshOS.knowledgeGraph` with `resource` nodes. `ash inbox add/list/show/archive` and `/inbox*`. See `docs/inbox.md` and `docs/second-brain-roadmap.md`. |
| `vault/` | Knowledge Vault — curated, long-form notes with links between them, one step further triaged than a raw Inbox capture. Same no-new-persistence-engine convention as `inbox/`: `VaultManager`'s notes are `MemoryManager` project-scope records tagged `vault`, and links between notes are `relates-to` edges on `AshOS.knowledgeGraph` (new `note` node kind) rather than a second graph. A note can be written directly or promoted from an Inbox item (`VaultManager.promoteFromInbox()`, marks the source item reviewed). `ash vault add/promote/list/show/archive/link/backlinks` and `/vault*`. See `docs/knowledge-vault.md`. |
| `search/` | `HybridSearch` (`AshOS.search`) — merges and ranks results from `MemoryManager`, the general `KnowledgeGraph`, `InboxManager`, and `VaultManager` into one "find everything about X" list. Owns no storage of its own; every slice queries its own store's existing lookup. `ash search` and `/search`. See `docs/search.md`. |
| `sdk/` | `AshOS` facade: the single class that wires kernel + providers + memory + tools + agents + planner + workflow + scheduler + innovation + codebase together with sane defaults. Used by both the CLI and the API. |
| `cli/` | `ash` command (`init`, `doctor`, `status`, `provider`, `plugin`, `plan`, `run`, `chat`, `memory`, `logs`, `innovation`, `codebase`, `graph`, `inbox`, `reflect`, `search`). |
| `api/` | Express REST API exposing `/chat`, `/plan`, `/execute`, `/workflow`, `/agents`, `/providers`, `/tools`, `/tasks`, `/memory`, `/logs`, `/health`, `/innovation/*`, `/codebase/*`, `/graph*`, `/inbox*`, `/reflect`, `/search`. |
| `plugins/` | Reference plugins (`git`, `shell`) showing the plugin contract. |
| `dashboard/` | Vite + React dashboard consuming the REST API, styled with Tailwind v4 and hand-authored shadcn/ui-style components (`dashboard/src/components/ui/`) — Radix primitives + `class-variance-authority`, not the shadcn CLI (see note below). |
| `examples/workflows/` | Example workflow JSON definitions. |

## Design principles in practice

- **Provider-agnostic**: every provider implements the same `AIProvider` interface (`providers/types.ts`). Switching providers is a one-line config change (`ash provider set <name>` or `ASHOS_PROVIDER` env var) — no other code references a concrete provider class.
- **Plugin-based**: anything beyond the kernel primitives (tools, agents, provider factories) is registered through a `Plugin` object receiving a `PluginHost` (`{ kernel, tools, agents, providers }`). See `docs/plugin-development.md`.
- **Local-first**: the default provider is `mock` (fully offline, deterministic) so `ash init && ash run "..."` works with zero API keys; Ollama is a first-class provider for local models.
- **Event-driven**: every subsystem emits onto a single process-wide `EventBus` (`task:*`, `agent:*`, `tool:executed`, `provider:switched`, `plugin:*`, `memory:updated`, `permission:*`, `workflow:*`, `scheduler:job-fired`, `log`). The dashboard/CLI/`logs` command read from this instead of parsing stdout.
- **Permissioned by default**: `PermissionManager` pattern-matches dangerous actions (`rm -rf`, `git push`, `docker rm`, `reboot`, ...) before tools execute them, and supports allow-once / always-allow / deny decisions persisted to `.ashos/permissions.json`.
- **One DAG executor, two consumers**: the Planner's LLM-generated task graphs and the Workflow engine's user-authored graphs both run through `kernel/dag.ts`, which handles parallelism, retries with backoff, and skip-on-failed-dependency semantics.
- **Discovery is offline-first and never auto-starts**: Innovation Intelligence (`innovation/`) ships with deterministic mock collectors for every domain (same role `MockProvider` plays for chat) and only ever runs when explicitly invoked (`ash innovation discover`, `POST /innovation/discover`, or a scheduled job) — no auto-start-on-boot behavior. See `docs/innovation.md`.

### Dashboard UI toolkit

The dashboard uses Tailwind CSS v4 (via `@tailwindcss/vite`, no PostCSS config needed) plus shadcn/ui-style components under `dashboard/src/components/ui/`. These were **hand-authored from the standard shadcn/ui source**, not generated by the `shadcn` CLI — `npx shadcn init` fetches its registry from `ui.shadcn.com`, which this environment's network policy blocks. The result is the same (Radix UI primitives + `class-variance-authority` + `tailwind-merge`, copied into the repo like the CLI would do), so if a future session *does* have access to `ui.shadcn.com`, `npx shadcn@latest add <component>` will work normally against this same `components.json`-less setup — just add a `components.json` first if you want the CLI to manage merges.

## What is intentionally out of scope for v0.1

See `docs/roadmap.md` for the full list (video/vision/voice agents, ComfyUI/FFmpeg/Playwright tool integrations, GraphQL/WebSocket/MCP transports, visual workflow builder, distributed execution, marketplace). The architecture above is built so each of those slots in as a provider, tool, or agent plugin without touching the kernel.
