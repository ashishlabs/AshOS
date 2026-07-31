# Roadmap

## Shipped in v0.1 (this repository)

- Kernel: event bus, structured logger, permission manager, plugin loader, agent router, context manager, generic DAG executor, config.
- Providers: `AIProvider` interface + Anthropic, OpenAI, Ollama, LM Studio (local, OpenAI-compatible), Mock, with a registry that resolves the active one from config/env.
- Tools: shell, git, filesystem, each with capabilities/requirements/permissions/health-check.
- Memory: short-term, session, project, global scopes + brute-force vector search for semantic recall.
- Agents: Generic, Code, Research, Git, Testing, routed by capability.
- Planner: goal → task graph via the active provider, with dependency-aware parallel execution, retries, and rollback hooks.
- Workflow engine: JSON-defined step graphs (`agent:<capability>` / `tool:<name>`) on the same DAG executor.
- Scheduler: cron-based recurring jobs.
- CLI (`ash init/doctor/status/provider/plugin/plan/run/chat/memory/logs/evolve`).
- REST API (`/chat /plan /execute /workflow /agents /providers /tools /tasks /memory /logs /health /evolution/*`).
- SDK facade (`AshOS` class) for embedding in other Node apps.
- Plugin system (manifest + `PluginHost` contract) with git/shell reference plugins, extended to Evolution Engine mutations/benchmarks (`evolution/plugins/evolution-extras`).
- Dashboard (Vite + React + Tailwind v4 + shadcn/ui-style components) with status, providers, agents, tools, plan, workflow, memory, logs, chat, and Evolution tabs, light/dark theming.
- **Evolution Engine**: continuous, reversible experimentation — observe → hypothesize (via a configurable research provider, LM Studio + Gemma by default) → mutate (in an isolated git worktree) → build → test → benchmark → accept/reject → store. 4 built-in mutations (prompt rewrite, temperature, retry count, workflow reorder) + 1 reference plugin mutation; 2 built-in benchmarks (code generation, reasoning) + 1 reference plugin benchmark. Never touches `main`; `autoMerge` defaults off. See `docs/evolution.md`.
- Unit + integration tests (vitest) across kernel/providers/tools/memory/agents/planner/workflow/scheduler/sdk/api/cli/evolution, including real-subprocess and real-throwaway-git-repo integration tests for the Evolution Engine.
- CI (GitHub Actions: typecheck + test), Docker + docker-compose (with an Ollama sidecar).
- **Innovation Intelligence**: continuous opportunity discovery — one `IntelligenceAgent` per domain (market, GitHub, community, research, workflow, competitor), each backed by a deterministic offline mock `Collector` by default (pluggable for a real network-backed one, same extension path as tools/providers); signals feed a JSON-backed `KnowledgeGraph`; an `OpportunityEngine` merges related signals (tag-overlap similarity) into ranked `Opportunity` records scored across all 15 dimensions from the design spec via a pure, dependency-free `ScoringEngine`; a `BuilderProfileStore` learns which categories the user favors (with a `reinforce()` hook for the Learning Loop); an idea lifecycle state machine (`captured -> ... -> released`, with archive/revive); a `DailyBriefGenerator` ranks opportunities and asks the configured research provider for a narrative, falling back gracefully offline. CLI (`ash innovation discover/list/show/brief/profile/collectors`) and REST API (`/innovation/*`). See `docs/innovation.md`.

## Explicitly deferred (not in this repository yet)

These are named in the AshOS vision but require substantial additional
scope (native app integrations, media pipelines, or infrastructure this
session did not build) — the architecture above is designed so each can
land as a provider/tool/agent/plugin without kernel changes:

- **Media/creative agents**: Video (FFmpeg/Hyperframes), Vision/ComfyUI, Voice (Whisper/F5-TTS/Kokoro) — `examples/workflows/youtube-pipeline.json` shows the intended shape.
- **Browser/desktop tool integrations**: Playwright browser agent, Docker tool, VS Code integration.
- **Additional providers**: Groq, OpenRouter, local GGUF runners (same `AIProvider` pattern as Ollama); as research providers for the Evolution Engine these work with zero engine changes once added.
- **Transports**: GraphQL API, WebSocket streaming, MCP server exposure.
- **Visual workflow builder** (drag-and-drop authoring of the JSON the workflow engine already executes).
- **Registry-based plugin installs** (`ash plugin install <name>` currently loads local `plugins/`; downloading from a community registry is future work).
- **Observability**: token usage / latency / GPU / CPU metrics dashboards beyond the current event-log view.
- **Security hardening**: secret encryption at rest, sandboxed tool execution, full audit-log UI.
- **Distributed execution, team/shared memory, mobile companion, cloud sync, plugin marketplace** — long-term vision items from the original spec.
- **Evolution Engine gaps**: only 3 of 10 benchmark categories and 4-5 of ~11 mutation kinds have real implementations (rest follow the same documented pattern); token-usage metrics aren't populated (no uniform token-count surface across providers yet); no UI for authoring mutations/benchmarks (they're TypeScript, same as tools/agents). See `docs/evolution.md`'s "What's not implemented" section.
- **Innovation Intelligence gaps**: only deterministic mock collectors ship built-in — real network-backed collectors (GitHub search API, Hacker News/Reddit JSON endpoints, arXiv API, Product Hunt, ...) follow the same `Collector` interface but aren't implemented; `BuilderProfileStore.reinforce()` (the Learning Loop's outcome-feedback hook) has no automatic caller yet; no automatic project/task/milestone scaffolding when an opportunity is accepted; no Weekly Deep Research report (only the Daily Brief); no dashboard UI page; knowledge-graph entity extraction is limited to problem/technology nodes until a real collector supplies richer structure. See `docs/innovation.md`'s "What's not implemented" section.
