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
   Evolution Engine (observe → hypothesize → mutate → benchmark → accept/reject)
     └─▶ isolated git worktree per experiment, never touches main
   Innovation Intelligence (collect signals → knowledge graph → merge into
     opportunities → score → Daily Brief)
```

## Package layout

| Path | Responsibility |
|---|---|
| `kernel/` | Composition root + cross-cutting primitives: event bus, logger, permission gate, plugin loader, agent router, context manager, generic DAG executor, config load/save. |
| `providers/` | `AIProvider` interface plus Anthropic, OpenAI, Ollama, LM Studio (OpenAI-compatible, local) and Mock implementations, and a registry that resolves the active one from config/env. |
| `tools/` | `Tool` interface plus shell, git and filesystem tools, each declaring capabilities/requirements/permissions and a health check. |
| `memory/` | `MemoryManager` unifying short-term (in-process, TTL), session (in-process), project (`.ashos/memory/project.json`) and global (`~/.ashos/memory/global.json`) scopes, backed by a brute-force cosine-similarity `VectorStore` for semantic recall. |
| `agents/` | `Agent` interface plus Code, Research, Git, Testing and Generic agents, routed by capability tag. |
| `planner/` | `Planner` turns a natural-language goal into a `TaskGraph` via the active provider (JSON-mode prompt with a safe single-task fallback); `TaskExecutor` runs the graph through the shared `DagExecutor`. |
| `workflow/` | `WorkflowEngine` executes user-authored JSON workflow definitions (chains of `agent:<capability>` / `tool:<name>` steps) through the same `DagExecutor`. |
| `scheduler/` | Cron-based `Scheduler` (via `node-cron`) for recurring automation, e.g. "every morning, check GitHub, summarize, email report". |
| `evolution/` | The Evolution Engine — continuous, reversible experimentation. `engine/` (observer, researcher, orchestration loop, real + fake workspace executors), `benchmark/`, `mutation/`, `evaluation/`, `history/` (JSON experiment store), `storage/` (git worktree isolation), `scheduler/`, `plugins/` (reference mutation/benchmark plugin). See `docs/evolution.md`. |
| `innovation/` | Innovation Intelligence — continuous opportunity discovery. `collectors/` (pluggable signal sources, mock by default), `agents/` (one `IntelligenceAgent` per domain: market/github/community/research/workflow/competitor), `graph/` (JSON-backed `KnowledgeGraph`), `opportunity/` (`ScoringEngine`, `OpportunityEngine` merging signals into ranked opportunities), `history/` (JSON opportunity store), `profile/` (learned Builder Profile), `brief/` (Daily Innovation Brief), `lifecycle.ts` (idea state machine). See `docs/innovation.md`. |
| `sdk/` | `AshOS` facade: the single class that wires kernel + providers + memory + tools + agents + planner + workflow + scheduler + evolution + innovation together with sane defaults. Used by both the CLI and the API. |
| `cli/` | `ash` command (`init`, `doctor`, `status`, `provider`, `plugin`, `plan`, `run`, `chat`, `memory`, `logs`, `evolve`, `innovation`). |
| `api/` | Express REST API exposing `/chat`, `/plan`, `/execute`, `/workflow`, `/agents`, `/providers`, `/tools`, `/tasks`, `/memory`, `/logs`, `/health`, `/evolution/*`, `/innovation/*`. |
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
- **Self-improvement is isolated by construction**: the Evolution Engine (`evolution/`) never mutates the live working directory — every experiment runs in its own `git worktree` on its own branch, and `main`/the base branch can never be merged into or targeted by rollback (enforced in code, not just convention). See `docs/evolution.md`.
- **Discovery is offline-first and never auto-starts**: Innovation Intelligence (`innovation/`) ships with deterministic mock collectors for every domain (same role `MockProvider` plays for chat) and only ever runs when explicitly invoked (`ash innovation discover`, `POST /innovation/discover`, or a scheduled job) — no auto-start-on-boot behavior. See `docs/innovation.md`.

### Dashboard UI toolkit

The dashboard uses Tailwind CSS v4 (via `@tailwindcss/vite`, no PostCSS config needed) plus shadcn/ui-style components under `dashboard/src/components/ui/`. These were **hand-authored from the standard shadcn/ui source**, not generated by the `shadcn` CLI — `npx shadcn init` fetches its registry from `ui.shadcn.com`, which this environment's network policy blocks. The result is the same (Radix UI primitives + `class-variance-authority` + `tailwind-merge`, copied into the repo like the CLI would do), so if a future session *does* have access to `ui.shadcn.com`, `npx shadcn@latest add <component>` will work normally against this same `components.json`-less setup — just add a `components.json` first if you want the CLI to manage merges.

## What is intentionally out of scope for v0.1

See `docs/roadmap.md` for the full list (video/vision/voice agents, ComfyUI/FFmpeg/Playwright tool integrations, GraphQL/WebSocket/MCP transports, visual workflow builder, distributed execution, marketplace). The architecture above is built so each of those slots in as a provider, tool, or agent plugin without touching the kernel.
