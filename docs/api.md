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

GraphQL, WebSocket, and MCP transports are on the roadmap (`docs/roadmap.md`) — the REST surface above is the current source of truth and is what the dashboard and CLI consume.
