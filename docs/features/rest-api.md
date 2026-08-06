# Feature: REST API

**Status:** ✅ Complete (79 routes; re-counted, includes `/scheduler*` added since this was last 43)

## 1. What is this feature?

Everything AshOS can do from the CLI or dashboard is also available over
plain HTTP. This is the integration point for building your own UI,
wiring AshOS into CI, or calling it from any language — you're not
limited to the terminal or the bundled dashboard.

**Business value:** AshOS becomes a service you can embed anywhere —
trigger a goal from a GitHub Action, pull memory into your own tool, or
build a completely custom frontend — without needing to shell out to the
CLI or import the TypeScript SDK directly.

## 2. Who is this for?

- **Developers integrating AshOS into another app or pipeline** (CI/CD,
  a Slack bot, a custom internal tool).
- **Anyone building their own frontend** instead of using the bundled
  dashboard.

## 3. How to use it

**Start the API server:**
```bash
npm run api          # http://localhost:4700, configurable via ASHOS_API_PORT
```

**Core routes:**
```bash
curl http://localhost:4700/health
curl -X POST http://localhost:4700/plan -H "content-type: application/json" -d '{"goal": "add tests for the login flow"}'
curl -X POST http://localhost:4700/execute -H "content-type: application/json" -d '{"goal": "add tests for the login flow"}'
curl http://localhost:4700/agents
curl http://localhost:4700/providers
curl http://localhost:4700/tools
curl "http://localhost:4700/memory?scope=project"
curl http://localhost:4700/logs
```

**Feature-specific route groups** (each documented in its own feature
page): `/providers/router` ([Model Router](./model-router.md)),
`/innovation/*` ([Innovation Intelligence](./innovation-intelligence.md)),
`/codebase/*` ([Local Codebase Intelligence](./codebase-intelligence.md)),
`/graph*` ([Knowledge Graph](./knowledge-graph.md)),
`/workflow` ([Workflow Engine](./workflow-engine.md)).

Full route reference: `docs/api.md`.

## 4. Example walkthrough

You're wiring a GitHub Action that asks AshOS to review a PR's diff
context and post a summary:

```yaml
- name: Ask AshOS
  run: |
    curl -X POST http://localhost:4700/execute \
      -H "content-type: application/json" \
      -d "{\"goal\": \"summarize the risk of this change: ${{ steps.diff.outputs.text }}\"}"
```

## 5. Tips & limitations

- **No authentication** — the API is designed for local/trusted-network
  use today. Don't expose it to the public internet without adding your
  own auth layer in front of it (e.g. a reverse proxy).
- Only REST exists — no GraphQL, WebSocket streaming, or MCP server
  transport yet (`POST /chat/stream` gives you chunked-plain-text
  streaming for chat specifically, which covers the most common
  streaming need).
- `createServer(ashos?)` accepts an existing `AshOS` instance, which
  matters if you're embedding the API inside a larger app rather than
  running it standalone.
