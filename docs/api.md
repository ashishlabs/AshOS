# REST API

Base URL: `http://localhost:4700` (configurable via `ASHOS_API_PORT`).
Start it with `npm run api`.

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/health` | — | `{ ok, provider }` |
| POST | `/chat` | `{ messages, options? }` | Proxies to the active provider's `chat()`. |
| POST | `/plan` | `{ goal }` | Returns a `TaskGraph` from the Planner. |
| POST | `/execute` | `{ goal }` | Plans and executes a goal; returns `{ graph, results }`. |
| POST | `/workflow` | a `WorkflowDefinition` | Runs a workflow (see `examples/workflows/`); returns `{ results }`. |
| GET | `/agents` | — | Registered agents and their capabilities. |
| GET | `/providers` | — | Active provider + all available provider names. |
| GET | `/tools` | — | Registered tools and their capabilities. |
| GET | `/tasks` | — | Recent `task:*` events from the event bus. |
| GET | `/memory?scope=&tag=&text=` | — | Queries the memory store. |
| GET | `/logs` | — | Recent structured log entries. |

GraphQL, WebSocket, and MCP transports are on the roadmap (`docs/roadmap.md`) — the REST surface above is the current source of truth and is what the dashboard and CLI consume.
