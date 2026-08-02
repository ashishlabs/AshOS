# Feature: Knowledge Graph

**Status:** ✅ Complete (v1 scope)

## 1. What is this feature?

A queryable graph connecting your Projects, Agents, and Tasks — every
time any agent does anything, it automatically records "this task was
produced by this agent" and "this task is part of this project" as real
graph edges, with zero setup on your part. This is separate from
Innovation Intelligence's own knowledge graph of market/tech entities —
same underlying engine, different data.

**Business value:** answer "what do I know about this project" by
tracing real connections between agents, tasks, and outcomes — instead
of manually cross-referencing three separate JSON stores (memory,
outcomes, codebase index) yourself.

## 2. Who is this for?

- **Anyone who wants a connected view of AshOS's own activity** — which
  agents have worked on this project, what tasks they ran, and how it
  all ties together.
- **Developers building on top of AshOS** who want to query relationship
  data programmatically instead of re-deriving it from raw logs.

## 3. How to use it

**See overall graph stats:**
```bash
ash graph stats
```

**List nodes, optionally filtered by kind:**
```bash
ash graph nodes
ash graph nodes --kind project
ash graph nodes --kind agent
ash graph nodes --kind task
```

**See everything connected to a specific node:**
```bash
ash graph neighbors <node-id>
```

**Via REST API:**
```bash
curl http://localhost:4700/graph
curl "http://localhost:4700/graph/nodes?kind=task"
curl http://localhost:4700/graph/nodes/<id>/neighbors
```

## 4. Example walkthrough

After running a few goals via `ash run`, see what accumulated:
```bash
ash graph stats                        # node/edge counts by kind
ash graph nodes --kind project         # find your project's node id
ash graph neighbors <project-node-id>  # every agent + task tied to it
```
Run `ash codebase index` on the same project and the project node gets
further enriched with real language/module data from
[Local Codebase Intelligence](./codebase-intelligence.md) — the same
node, not a duplicate, because both writers key on the same project path.

## 5. Tips & limitations

- No `repository` nodes yet — [Repository Intelligence (external)](./repository-intelligence.md)
  doesn't write into this graph today.
- No decision/document node kinds, and no dashboard visualization yet —
  CLI/REST only.
- No cross-file relationship tracking (imports, call graphs) — that's a
  natural future extension shared with Codebase Intelligence.
- Full technical detail: `docs/knowledge-graph.md`.
