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
| GET | `/providers/router` | — | Current `RouterConfig` (task-aware provider selection, off by default). |
| PATCH | `/providers/router` | partial `RouterConfig` | Merges into and persists the router config. See `docs/model-router.md`. |
| GET | `/tools` | — | Registered tools and their capabilities. |
| GET | `/tasks` | — | Recent `task:*` events from the event bus. |
| GET | `/events?prefix=` | — | Full event bus history, optionally filtered by name prefix (e.g. `agent:`, `workflow:`). Powers the dashboard's Recent Activity feed. |
| GET | `/memory?scope=&tag=&text=` | — | Queries the memory store. |
| POST | `/memory` | `{ scope, key, value, tags? }` | Writes a memory record via `MemoryManager.remember()`. |
| POST | `/memory/forget` | `{ scope, key }` | Deletes a memory record. |
| GET | `/logs` | — | Recent structured log entries. Every event bus emission (except `log` itself) is mirrored into the logger by `Kernel`, so this doubles as a live activity log even if no subsystem calls the logger directly. |
| GET | `/agents/github-trending?limit=` | — | Runs the `github-trending` agent on demand (real GitHub Search API call, no caching) and returns its `AgentResult`, e.g. `{ ok, output, data: { repos, sinceDays, topics } }`. Powers the dashboard's Trending tab. |
| GET | `/reflect?period=` | — | Runs the `reflection` agent: a daily (default)/weekly/monthly review narrative from Outcome Memory + Inbox + Knowledge Graph activity in that window. See `docs/second-brain-roadmap.md`'s Reflection Agent entry. |
| GET | `/reflect?period=&cached=true` | — | Reads today's already-saved reflection from `.ashos/reflections/` without calling the LLM again; `404` if none has been saved today for that period. |
| GET | `/reflect?period=&save=true` | — | Same as the plain call, but also persists the result so a later `cached=true` call reads it back for free. This is what `AshOS.startScheduledJobs()`'s daily job calls internally. |
| GET | `/search?q=&limit=&semantic=` | — | Hybrid search: merges and ranks results from Memory, the Knowledge Graph, and the Inbox. `400` if `q` is missing. `semantic=true` uses embedding similarity for the Memory slice. See `docs/search.md`. |

### Innovation Intelligence (`/innovation/*`)

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/innovation/discover` | `{ domains?, live? }` | Fire-and-forget: starts a discovery cycle in the background and returns `202 { started: true, live }` immediately, or `409` if one is already running. `domains` restricts the cycle to a subset (defaults to `config.innovation.domains`); `live: true` runs every real live collector (GitHub/HN/Reddit/arXiv/Hugging Face) instead of the offline mock collectors. |
| GET | `/innovation/status` | — | `{ running, config }` — whether a cycle is in flight plus the active `InnovationConfig`. |
| GET | `/innovation/opportunities?stage=&limit=` | — | Opportunities, highest-scoring first (or filtered by lifecycle stage). |
| GET | `/innovation/opportunities/:id` | — | Full record for one opportunity (score, evidence signals, history), or `404`. |
| GET | `/innovation/brief` | — | Generates today's Daily Innovation Brief on demand. |
| GET | `/innovation/profile?limit=` | — | Top Builder Profile categories by learned weight. |
| GET | `/innovation/collectors` | — | Registered (offline-by-default) collectors (`id`, `domain`, `description`). Does not include the opt-in `liveCollectors` — see below. |
| GET | `/innovation/live-collectors` | — | The five real, opt-in collectors (GitHub, Hacker News, Reddit, arXiv, Hugging Face) — never swept by a default discovery cycle, only run via `live: true` / `/innovation/digest`. |
| POST | `/innovation/digest` | `{ sources? }` | Runs `runLiveDiscovery()` across every (or a selected subset of, by collector id) live collector and returns `{ markdown, path, result }` — a Markdown "today's AI news" report, also saved to `.ashos/innovation/digests/<date>.md`. `409` if a digest run is already in progress. |
| GET | `/innovation/graph` | — | Knowledge graph stats (`nodeCount`, `edgeCount`, `byKind`). |
| GET | `/innovation/events?category=&limit=` | — | Canonical, deduplicated `IntelligenceEvent`s, optionally filtered by category. |
| GET | `/innovation/events/:id` | — | One event by id, or `404`. |
| GET | `/innovation/repositories?limit=` | — | Every cached `RepositoryProfile`. |
| GET | `/innovation/repositories/:owner/:repo` | — | One cached profile, or `404` if not yet analyzed. |
| POST | `/innovation/repositories/analyze` | `{ fullName }` | Runs the `repository-analyst` agent (real GitHub API call, cached by `pushed_at`) and returns its `AgentResult`. `400` if `fullName` isn't an `"owner/repo"` string. |
| GET | `/innovation/radar?ring=` | — | Current Technology Radar entries, optionally filtered by ring. |
| POST | `/innovation/radar/refresh` | — | Runs the `technology-radar` agent to reclassify every tracked technology from the current knowledge graph, and returns its `AgentResult`. |
| POST | `/innovation/ideas` | `{ inboxId?, content?, tags?, domain? }` | Runs the `idea` agent: scores/dedupes an Inbox item (marking it `reviewed`) or raw text into an Innovation `Opportunity`, reusing the same pipeline a discovery cycle uses. `201 { opportunity, created }`, or `400` if neither `inboxId` nor `content` is given (or `inboxId` doesn't exist). See `docs/innovation.md`'s "Idea Agent" section. |
| GET | `/innovation/config` | — | Current `InnovationConfig`. |
| PATCH | `/innovation/config` | partial `InnovationConfig` | Merges into and persists the innovation config. |

See `docs/innovation.md` for the full pipeline (collectors, event
normalization/dedup, knowledge graph, opportunity merging/scoring, builder
profile, repository intelligence, technology radar, daily brief) that
these routes expose, and `docs/ashos-intelligence.md` for the broader
AshOS Intelligence architecture this is the first slice of.

### Local Codebase Intelligence (`/codebase/*`)

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/codebase` | — | Every repository indexed so far. |
| POST | `/codebase/index` | `{ root?, force? }` | Index (or re-index) a local repository — defaults to the AshOS project root; cached by git commit hash unless `force: true`. |
| GET | `/codebase/search?q=&root=` | — | Search a previously indexed repository by symbol name or file path; `400` if `q` is missing. |

See `docs/codebase-intelligence.md`. Distinct from `/innovation/repositories/*` above, which analyzes external GitHub repos rather than the local filesystem.

### Universal Inbox (`/inbox*`)

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/inbox` | `{ content, sourceType?, tags? }` | Captures and auto-classifies content (text/url/github-repo/youtube/tweet/pdf/article). `201` with the created item, `400` if `content` is empty. |
| GET | `/inbox?status=` | — | List items, newest first, optionally filtered by status (`unread`/`reviewed`/`archived`). |
| GET | `/inbox/:id` | — | One item, or `404`. |
| POST | `/inbox/:id/archive` | — | Marks an item archived; `404` if unknown. |

See `docs/inbox.md`. Items are `MemoryManager` project-scope records, not a separate datastore; promoting one to an Innovation Opportunity is `POST /innovation/ideas` above.

### General Knowledge Graph (`/graph*`)

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/graph` | — | Node/edge counts, grouped by kind, for the general project-wide graph (distinct from `/innovation/graph`, which reports Innovation Intelligence's own namespaced graph). |
| GET | `/graph/nodes?kind=` | — | List nodes, optionally filtered by kind (`project`, `agent`, `task`, ...). |
| GET | `/graph/nodes/:id/neighbors` | — | Every node directly connected to the given node id, with the connecting edge. |
| GET | `/graph/edges` | — | Every edge in the graph. Powers the dashboard's Graph tab visualization, which needs the whole edge set at once rather than one `neighbors` call per node. |

Populated automatically by every agent execution (`BaseAgent`) and enriched by `CodebaseAnalystAgent` — see `docs/knowledge-graph.md`.

GraphQL, WebSocket, and MCP transports are on the roadmap (`docs/roadmap.md`) — the REST surface above is the current source of truth and is what the dashboard and CLI consume.
