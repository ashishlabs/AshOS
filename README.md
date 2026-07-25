# AshOS

**AshOS is an open-source AI Operating System that orchestrates multiple AI
models, local tools, agents, and automation into a single workspace.** It's
built to behave like an AI employee — understanding goals, planning work,
delegating to specialized agents, executing tools, remembering context, and
recovering from failures — rather than another chatbot.

Local-first · Modular · Plugin-based · Provider-agnostic · Open Source

## Quick start

```bash
npm install
cp .env.example .env      # optional: add ANTHROPIC_API_KEY / OPENAI_API_KEY / OLLAMA_BASE_URL
npm run cli -- init       # writes .ashos/config.json (defaults to the offline "mock" provider)
npm run cli -- doctor     # checks tool health + provider connectivity
npm run cli -- run "Set up a health-check endpoint for this API"
```

Start the REST API and dashboard:

```bash
npm run api               # http://localhost:4700
npm run dashboard:dev     # http://localhost:5173 (proxies /api -> :4700)
```

Run tests:

```bash
npm test
npm run test:coverage
```

## What's here

```
kernel/     event bus, logger, permissions, plugin loader, agent router, DAG executor, config
providers/  AIProvider interface + Anthropic, OpenAI, Ollama, Mock, and a registry
tools/      Tool interface + shell, git, filesystem
memory/     short-term / session / project / global memory + vector search
agents/     Agent interface + Generic, Code, Research, Git, Testing
planner/    goal -> task graph (via the active provider) + parallel/retrying executor
workflow/   JSON-defined workflow engine (same DAG executor as the planner)
scheduler/  cron-based recurring jobs
sdk/        AshOS facade wiring everything together for embedding
cli/        `ash` command
api/        REST API (express)
plugins/    reference plugins (git, shell) + plugin dev guide
dashboard/  minimal Vite + React UI
examples/   example workflow definitions
docs/       architecture, plugin, provider, API, CLI, roadmap docs
```

See [`docs/architecture.md`](docs/architecture.md) for the full picture,
[`docs/PRD.md`](docs/PRD.md) for product vision/requirements/status,
[`docs/roadmap.md`](docs/roadmap.md) for what's shipped vs. planned,
[`docs/test-report.md`](docs/test-report.md) for the latest test results and
known gaps, and [`docs/plugin-development.md`](docs/plugin-development.md)
to add your own provider/tool/agent.

## Switching providers

Everything goes through the `AIProvider` interface — switching providers
is one config change, never a code change:

```bash
ash provider list
ash provider set anthropic   # or openai / ollama / mock
```

## CLI

See [`docs/cli.md`](docs/cli.md) for the full command reference
(`init`, `doctor`, `status`, `provider`, `plugin`, `plan`, `run`, `chat`,
`memory`, `logs`).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Licensed under [MIT](LICENSE).
