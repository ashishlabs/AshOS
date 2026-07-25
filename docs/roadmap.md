# Roadmap

## Shipped in v0.1 (this repository)

- Kernel: event bus, structured logger, permission manager, plugin loader, agent router, context manager, generic DAG executor, config.
- Providers: `AIProvider` interface + Anthropic, OpenAI, Ollama, Mock, with a registry that resolves the active one from config/env.
- Tools: shell, git, filesystem, each with capabilities/requirements/permissions/health-check.
- Memory: short-term, session, project, global scopes + brute-force vector search for semantic recall.
- Agents: Generic, Code, Research, Git, Testing, routed by capability.
- Planner: goal → task graph via the active provider, with dependency-aware parallel execution, retries, and rollback hooks.
- Workflow engine: JSON-defined step graphs (`agent:<capability>` / `tool:<name>`) on the same DAG executor.
- Scheduler: cron-based recurring jobs.
- CLI (`ash init/doctor/status/provider/plugin/plan/run/chat/memory/logs`).
- REST API (`/chat /plan /execute /workflow /agents /providers /tools /tasks /memory /logs /health`).
- SDK facade (`AshOS` class) for embedding in other Node apps.
- Plugin system (manifest + `PluginHost` contract) with git/shell reference plugins.
- Minimal dashboard (Vite + React) for status, providers, agents, tools, and interactive planning.
- Unit + integration tests (vitest) across kernel/providers/tools/memory/agents/planner/workflow/scheduler/sdk/api.
- CI (GitHub Actions: typecheck + test), Docker + docker-compose (with an Ollama sidecar).

## Explicitly deferred (not in this repository yet)

These are named in the AshOS vision but require substantial additional
scope (native app integrations, media pipelines, or infrastructure this
session did not build) — the architecture above is designed so each can
land as a provider/tool/agent/plugin without kernel changes:

- **Media/creative agents**: Video (FFmpeg/Hyperframes), Vision/ComfyUI, Voice (Whisper/F5-TTS/Kokoro) — `examples/workflows/youtube-pipeline.json` shows the intended shape.
- **Browser/desktop tool integrations**: Playwright browser agent, Docker tool, VS Code integration.
- **Additional providers**: Groq, OpenRouter, local GGUF runners (same `AIProvider` pattern as Ollama).
- **Transports**: GraphQL API, WebSocket streaming, MCP server exposure.
- **Visual workflow builder** (drag-and-drop authoring of the JSON the workflow engine already executes).
- **Registry-based plugin installs** (`ash plugin install <name>` currently loads local `plugins/`; downloading from a community registry is future work).
- **Observability**: token usage / latency / GPU / CPU metrics dashboards beyond the current event-log view.
- **Security hardening**: secret encryption at rest, sandboxed tool execution, full audit-log UI.
- **Distributed execution, team/shared memory, mobile companion, cloud sync, plugin marketplace, self-improving planner** — long-term vision items from the original spec.
