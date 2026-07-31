# REST API

Base URL: `http://localhost:4700` (configurable via `ASHOS_API_PORT`).
Start it with `npm run api`.

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/health` | — | `{ ok, provider }` |
| POST | `/chat` | `{ messages, options? }` | Proxies to the active provider's `chat()`. |
| POST | `/chat/stream` | `{ messages, options? }` | Streams the active provider's `stream()` output as chunked plain text. |
| POST | `/plan` | `{ goal }` | Returns a `TaskGraph` from the Planner. |
| POST | `/execute` | `{ goal }` | Plans and executes a goal; returns `{ graph, results }`. |
| POST | `/workflow` | a `WorkflowDefinition` | Runs a workflow (see `examples/workflows/`); returns `{ results }`. |
| GET | `/agents` | — | Registered agents and their capabilities. |
| GET | `/providers` | — | Active provider + all available provider names. |
| GET | `/tools` | — | Registered tools and their capabilities. |
| GET | `/tasks` | — | Recent `task:*` events from the event bus. |
| GET | `/events?prefix=` | — | Full event bus history, optionally filtered by name prefix (e.g. `agent:`, `workflow:`). Powers the dashboard's Recent Activity feed. |
| GET | `/memory?scope=&tag=&text=` | — | Queries the memory store. |
| POST | `/memory` | `{ scope, key, value, tags? }` | Writes a memory record via `MemoryManager.remember()`. |
| POST | `/memory/forget` | `{ scope, key }` | Deletes a memory record. |
| GET | `/logs` | — | Recent structured log entries. Every event bus emission (except `log` itself) is mirrored into the logger by `Kernel`, so this doubles as a live activity log even if no subsystem calls the logger directly. |
| GET | `/agents/github-trending?limit=` | — | Runs the `github-trending` agent on demand (real GitHub Search API call, no caching) and returns its `AgentResult`, e.g. `{ ok, output, data: { repos, sinceDays, topics } }`. Powers the dashboard's Trending tab. |

### Innovation Intelligence (`/innovation/*`)

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/innovation/discover` | `{ domains? }` | Fire-and-forget: starts a discovery cycle in the background and returns `202 { started: true }` immediately, or `409` if one is already running. `domains` restricts the cycle to a subset (defaults to `config.innovation.domains`). |
| GET | `/innovation/status` | — | `{ running, config }` — whether a cycle is in flight plus the active `InnovationConfig`. |
| GET | `/innovation/opportunities?stage=&limit=` | — | Opportunities, highest-scoring first (or filtered by lifecycle stage). |
| GET | `/innovation/opportunities/:id` | — | Full record for one opportunity (score, evidence signals, history), or `404`. |
| GET | `/innovation/brief` | — | Generates today's Daily Innovation Brief on demand. |
| GET | `/innovation/profile?limit=` | — | Top Builder Profile categories by learned weight. |
| GET | `/innovation/collectors` | — | Registered collectors (`id`, `domain`, `description`). |
| GET | `/innovation/graph` | — | Knowledge graph stats (`nodeCount`, `edgeCount`, `byKind`). |
| GET | `/innovation/config` | — | Current `InnovationConfig`. |
| PATCH | `/innovation/config` | partial `InnovationConfig` | Merges into and persists the innovation config. |

See `docs/innovation.md` for the full pipeline (collectors, knowledge graph, opportunity merging/scoring, builder profile, daily brief) that these routes expose.

GraphQL, WebSocket, and MCP transports are on the roadmap (`docs/roadmap.md`) — the REST surface above is the current source of truth and is what the dashboard and CLI consume.
