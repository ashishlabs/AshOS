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
```

## Package layout

| Path | Responsibility |
|---|---|
| `kernel/` | Composition root + cross-cutting primitives: event bus, logger, permission gate, plugin loader, agent router, context manager, generic DAG executor, config load/save. |
| `providers/` | `AIProvider` interface plus Anthropic, OpenAI, Ollama and Mock implementations, and a registry that resolves the active one from config/env. |
| `tools/` | `Tool` interface plus shell, git and filesystem tools, each declaring capabilities/requirements/permissions and a health check. |
| `memory/` | `MemoryManager` unifying short-term (in-process, TTL), session (in-process), project (`.ashos/memory/project.json`) and global (`~/.ashos/memory/global.json`) scopes, backed by a brute-force cosine-similarity `VectorStore` for semantic recall. |
| `agents/` | `Agent` interface plus Code, Research, Git, Testing and Generic agents, routed by capability tag. |
| `planner/` | `Planner` turns a natural-language goal into a `TaskGraph` via the active provider (JSON-mode prompt with a safe single-task fallback); `TaskExecutor` runs the graph through the shared `DagExecutor`. |
| `workflow/` | `WorkflowEngine` executes user-authored JSON workflow definitions (chains of `agent:<capability>` / `tool:<name>` steps) through the same `DagExecutor`. |
| `scheduler/` | Cron-based `Scheduler` (via `node-cron`) for recurring automation, e.g. "every morning, check GitHub, summarize, email report". |
| `sdk/` | `AshOS` facade: the single class that wires kernel + providers + memory + tools + agents + planner + workflow + scheduler together with sane defaults. Used by both the CLI and the API. |
| `cli/` | `ash` command (`init`, `doctor`, `status`, `provider`, `plugin`, `plan`, `run`, `chat`, `memory`, `logs`). |
| `api/` | Express REST API exposing `/chat`, `/plan`, `/execute`, `/workflow`, `/agents`, `/providers`, `/tools`, `/tasks`, `/memory`, `/logs`, `/health`. |
| `plugins/` | Reference plugins (`git`, `shell`) showing the plugin contract. |
| `dashboard/` | Minimal Vite + React UI consuming the REST API. |
| `examples/workflows/` | Example workflow JSON definitions. |

## Design principles in practice

- **Provider-agnostic**: every provider implements the same `AIProvider` interface (`providers/types.ts`). Switching providers is a one-line config change (`ash provider set <name>` or `ASHOS_PROVIDER` env var) — no other code references a concrete provider class.
- **Plugin-based**: anything beyond the kernel primitives (tools, agents, provider factories) is registered through a `Plugin` object receiving a `PluginHost` (`{ kernel, tools, agents, providers }`). See `docs/plugin-development.md`.
- **Local-first**: the default provider is `mock` (fully offline, deterministic) so `ash init && ash run "..."` works with zero API keys; Ollama is a first-class provider for local models.
- **Event-driven**: every subsystem emits onto a single process-wide `EventBus` (`task:*`, `agent:*`, `tool:executed`, `provider:switched`, `plugin:*`, `memory:updated`, `permission:*`, `workflow:*`, `scheduler:job-fired`, `log`). The dashboard/CLI/`logs` command read from this instead of parsing stdout.
- **Permissioned by default**: `PermissionManager` pattern-matches dangerous actions (`rm -rf`, `git push`, `docker rm`, `reboot`, ...) before tools execute them, and supports allow-once / always-allow / deny decisions persisted to `.ashos/permissions.json`.
- **One DAG executor, two consumers**: the Planner's LLM-generated task graphs and the Workflow engine's user-authored graphs both run through `kernel/dag.ts`, which handles parallelism, retries with backoff, and skip-on-failed-dependency semantics.

## What is intentionally out of scope for v0.1

See `docs/roadmap.md` for the full list (video/vision/voice agents, ComfyUI/FFmpeg/Playwright tool integrations, GraphQL/WebSocket/MCP transports, visual workflow builder, distributed execution, marketplace). The architecture above is built so each of those slots in as a provider, tool, or agent plugin without touching the kernel.
