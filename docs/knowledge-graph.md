# General Knowledge Graph

The General Knowledge Graph is North Star roadmap Stage 4
(`docs/roadmap-v2.md`) — it connects Projects, Agents, and Tasks into one
queryable structure instead of three isolated JSON stores a user has to
check individually. It closes goal #12 (Knowledge Graph) and is the
connective tissue between Local Codebase Intelligence, external Repository
Intelligence, and Outcome Memory.

## A second instance of an existing class, not new infrastructure

`KnowledgeGraph` (`graph/knowledge-graph.ts`) already existed as Innovation
Intelligence's "Unified Knowledge Graph" — and its type vocabulary
(`KnowledgeNodeKind`) already included `"project"`, `"agent"`, `"workflow"`,
`"skill"`, and `"tool"` alongside the Innovation-specific kinds, but nothing
ever created a node of those kinds. Stage 4 is that class made genuinely
reusable:

- The class and its types moved from `innovation/graph/` to a new
  top-level `graph/` package (`graph/knowledge-graph.ts`, `graph/types.ts`)
  — `innovation/types.ts` re-exports the same type names for backward
  compatibility.
- `KnowledgeGraph`'s constructor gained an optional `namespace` option:
  `new KnowledgeGraph(root, { namespace: "innovation" })` preserves
  Innovation Intelligence's original file location
  (`.ashos/innovation/graph.json`, unchanged, no data migration needed);
  `new KnowledgeGraph(root)` (no namespace) is the new general-purpose
  graph, at `.ashos/graph.json`.
- `AshOS.knowledgeGraph` is the general instance, added to `agentContext()`
  as `AgentContext.graph`.
- A new `"task"` node kind was added to `KnowledgeNodeKind` — the one
  genuinely new type, since nothing existed to represent a task before.
- Two more kinds were added after Stage 4 shipped, by the same "extend
  the union, no new infrastructure" pattern: `"resource"` for Universal
  Inbox (`docs/inbox.md`) — a captured, untriaged piece of content — and
  `"note"` for the Knowledge Vault (`docs/knowledge-vault.md`) — a
  curated, titled note, one step further triaged than a raw `resource`. A
  note promoted from an inbox item gets a `relates-to` edge back to its
  originating `resource` node.
- `"todo"` and `"milestone"` were added for Project Workspaces
  (`docs/project-workspaces.md`) — a persisted `ProjectTask`/`Milestone`
  record. Deliberately **not** the existing `"task"` kind: `task` already
  means a one-off agent *execution* record identified by `AgentTask.id`
  (see above), and reusing it for a persisted, human-titled to-do item
  risked an unrelated run and an unrelated to-do merging into one node if
  their labels ever collided (`upsertNode` de-dupes by `(kind, label)`).
  Every `todo`/`milestone` node gets a `part-of` edge to its `project`
  node, and its label is prefixed with the project's name
  (`"<project name>: <title>"`) to avoid same-titled tasks across
  different projects merging into one node.

## What gets recorded, and by whom

**Every agent, for free** — `BaseAgent.execute()` (`agents/base-agent.ts`,
the same integration point Stage 2's routing and Stage 3's Outcome Memory
use) calls `recordGraphActivity()` after every attempt, when
`context.graph` is present:

```
task --produced-by--> agent
task --part-of------> project
```

- **`agent` node**: identity = the agent's `name` (e.g. `"code"`,
  `"codebase-analyst"`). Tagged with its primary capability.
- **`project` node**: identity = `context.cwd`. This is deliberately the
  *working directory the agent ran in*, not a name the user picks — so it
  matches whatever `AshOS` was constructed against.
- **`task` node**: identity = `task.id`. This is a different, coarser-
  grained semantic than Outcome Memory's one-record-per-attempt log — a
  *recurring* task id (e.g. the same workflow step run on a schedule)
  strengthens one node and refreshes its `data` to the latest outcome,
  rather than cloning a new node per run. If you need the full attempt-by-
  attempt history, that's what `docs/outcome-memory.md` is for; the graph
  answers "what's connected to what," not "show me every attempt."

**Local Codebase Intelligence, additionally** —
`CodebaseAnalystAgent.enrichProjectNode()`
(`codebase/agents/codebase-analyst-agent.ts`) upserts the *indexed
repository's root* (not necessarily `context.cwd` — indexing a different
path gets its own node) as a `project` node tagged with every language
found, with `data: { path, fileCount, modules }`. Because `upsertNode`
merges by `(kind, label)`, this is the *same* node `BaseAgent` already
created when `context.cwd` matches the indexed root — one project node,
enriched from two different angles (general task activity, and real
codebase structure), verified live: analyzing a repo after running a goal
in it merges into the same project node rather than creating a duplicate.

Both recording paths are best-effort — a graph-write failure is caught and
never surfaces as a failure of the actual task or index.

## Querying

```bash
ash graph stats                    # node/edge counts, grouped by kind
ash graph nodes --kind project     # every project AshOS has touched
ash graph nodes --kind agent       # every agent that has run
ash graph neighbors <node-id>      # everything directly connected to a node
```

Or the REST API: `GET /graph` (stats), `GET /graph/nodes?kind=`,
`GET /graph/nodes/:id/neighbors`, `GET /graph/edges` (every edge, added
alongside the dashboard visualization below — the per-node `neighbors`
route doesn't scale to "give me the whole graph" without one request per
node).

Example: after running one goal and then indexing the same directory,
`ash graph nodes --kind project` shows one project node whose `neighbors`
include both the task that ran there and the task that indexed it —
`ash graph neighbors <project-node-id>` traces both back to their
respective agents.

## Dashboard visualization

The dashboard's **Graph** tab renders the whole graph visually — fetching
`GET /graph/nodes` and `GET /graph/edges` once, then laying it out with a
small, dependency-free force simulation (`dashboard/src/graph-layout.ts`:
repulsion between every node pair, spring attraction along edges,
simulated-annealing cooling — the same category of algorithm a library
like d3-force provides, hand-rolled instead of adding one, the same
"no vendor SDK where a transparent implementation will do" convention as
`codebase/indexer.ts`'s regex symbol extraction). Nodes are colored by
kind (a deterministic string-hash-to-color function, so every kind —
including ones added later — gets a stable color with no palette to keep
in sync), filterable by kind, and clickable: selecting a node dims
everything not directly connected to it and lists its neighbors by kind
and label in a side panel. The layout is recomputed only when the visible
node/edge *set* changes (not on every render), so selecting a node
highlights it without the rest of the graph jumping around. No
auto-polling — click Refresh after running something that adds nodes.

## Relationship to Innovation Intelligence's own graph

These are two separate `KnowledgeGraph` instances with separate files —
`ash innovation` commands and `/innovation/graph` continue to read/write
`.ashos/innovation/graph.json` exactly as before (via
`{ namespace: "innovation" }`); nothing about Stage 4 changes Innovation
Intelligence's behavior or data. `ash graph` and `/graph/*` are the new,
separate general-purpose surface at `.ashos/graph.json`.

## What's not implemented

- **No `repository` nodes yet for external Repository Intelligence.**
  `RepositoryAnalystAgent` doesn't yet write into the general graph the
  way `CodebaseAnalystAgent` does — a natural next step, using the same
  `upsertNode`-on-attempt pattern.
- **No decision/documentation node kinds populated.** The type vocabulary
  doesn't have dedicated kinds for "a decision was made" or "a doc was
  written" — `idea`/`product` are the closest existing kinds; a real need
  for these should add new `KnowledgeNodeKind` values the same low-risk
  way `task` was added.
- **No cross-file relationship tracking** (imports, call graphs) inside a
  single project — `CodebaseAnalystAgent`'s own index knows files and
  symbols but doesn't yet feed individual files/symbols into the graph as
  nodes, only a summary per project.
