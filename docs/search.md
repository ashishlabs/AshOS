# Hybrid Search

`HybridSearch` (`search/hybrid-search.ts`, `AshOS.search`) answers "find
everything about X" across the six stores a Second Brain capture/connect
flow actually populates — Memory, the general Knowledge Graph, the
Inbox, the Vault, Project Workspaces, and the Learning Hub — without
adding a seventh search index. It's Tier 2 item 6 of
`docs/second-brain-roadmap.md`, closing out that tier (the Vault/
Workspace/Learning slices were each added once their own subsystem
shipped, see `docs/knowledge-vault.md`/`docs/project-workspaces.md`/
`docs/learning-hub.md`).

## Quick start

```bash
ash search "langgraph"
ash search "langgraph" --semantic   # embedding similarity for Memory/Inbox/Vault/Workspace/Learning
ash search "langgraph" --limit 5
```

Or the REST API: `GET /search?q=&limit=&semantic=`. Or the dashboard's
Search tab.

## How it works

`HybridSearch` doesn't own any storage — it queries each store's existing
lookup, then merges and ranks. In **keyword mode** (the default):

```
MemoryManager.query({ text })          — keyword: value substring match
KnowledgeGraph.listNodes()             — keyword: label/tag substring match
InboxManager.list()                    — keyword: content/tag substring match
VaultManager.list()                    — keyword: title/content/tag substring match
WorkspaceManager.list*()               — keyword: name/title/description/tag substring match
LearningManager.list*()                — keyword: title/notes/front/back/tag substring match
        │
merge, sort by score desc (tie-break: newest first), slice to `limit`
```

In **semantic mode** (`{ semantic: true }`):

```
MemoryManager.searchSemantic()   — ONE embedding-similarity call, covering
                                    Memory, Inbox, Vault, Workspace, and
                                    Learning at once (see below), then
                                    partitioned back into each source's own
                                    hit shape by its subsystem tag
        │
KnowledgeGraph.listNodes()       — keyword: label/tag substring match (unchanged —
                                    Graph nodes have no embedding storage yet)
        │
merge, sort by score desc (tie-break: newest first), slice to `limit`
```

Every keyword slice is a deterministic substring heuristic — same
"transparent heuristic over an LLM/embedding call wherever one is good
enough" convention as `codebase/indexer.ts`'s `searchIndex`. Semantic mode
works for five of the six sources because Inbox/Vault/Workspace/Learning
records are themselves `MemoryManager` records (see the section below) —
they already get a best-effort embedding computed and indexed the moment
they're captured/created, with no new indexing work required to search
them semantically. **Graph is the one exception**: `KnowledgeNode`s are
stored in their own JSON file with no embedding field, so Graph results
stay keyword-based in both modes — closing that gap would mean either
computing embeddings inside `KnowledgeGraph.upsertNode()` (which ~20
call sites across `agents/base-agent.ts`, `workspace-manager.ts`,
`vault-manager.ts`, `inbox-manager.ts`, `learning-manager.ts`, and the
Innovation agents call synchronously today — turning it async is a wider,
separate decision) or a lazy on-demand embedding pass at query time
(expensive: one provider round-trip per ungraphed node per search). Both
require an active provider; without one, `searchSemantic()` falls back to
its own keyword matching per `MemoryManager`'s documented behavior, so
`{ semantic: true }` never throws or returns nothing just because no
provider is configured.

The Workspace slice searches all three entity types (projects, tasks,
milestones) and returns every match under one `"workspace"` source —
a task/milestone hit's snippet names its parent project
(e.g. `[task/done] Website redesign`) since a bare task title alone
wouldn't be identifiable in a merged results list. The Learning slice
similarly searches both resources and flashcards under one `"learning"`
source — a flashcard hit's title is its front, with the back shown in the
snippet.

## Scoring

A single deterministic `textScore()` heuristic is shared by every keyword
slice: exact match on title/label/content or a tag → `1.0`, prefix match
→ `0.75`, substring match → `0.5`. Memory hits that only matched through
`MemoryManager.query`'s value-substring pre-filter (not found in the key
or tags) get a flat `0.4` — still a real hit, just a weaker one, since the
pre-filter doesn't distinguish key/tag matches into a score itself.

Semantic hits (Memory, Inbox, Vault, Workspace, Learning) use rank
position — one `searchSemantic()` call returns results already ordered by
cosine similarity across all five sources at once, but doesn't expose the
raw similarity score, so each hit's position in that ranked list is
converted into a comparable `0-1` value instead.

## Inbox, Vault, Workspace, and Learning records never double up as Memory hits

None of Universal Inbox, Knowledge Vault, Project Workspaces, or the
Learning Hub has a persistence engine of its own — every `InboxItem` is a
`MemoryManager` project-scope record tagged `"inbox"`, every `VaultNote`
is one tagged `"vault"`, every `Project`/`ProjectTask`/`Milestone` is one
tagged `"workspace-project"`/`"workspace-task"`/`"workspace-milestone"`,
and every `LearningResource`/`Flashcard` is one tagged
`"learning-resource"`/`"learning-flashcard"` (see
`docs/inbox.md`/`docs/knowledge-vault.md`/`docs/project-workspaces.md`/
`docs/learning-hub.md`). Without deduplication, a query matching one of
these would return it twice: once as a raw `memory` hit (JSON dump) and
once as a properly formatted hit from its own slice. In keyword mode,
`HybridSearch` excludes any Memory record tagged `"inbox"`, `"vault"`, or
with any tag starting with `"workspace-"` or `"learning-"` from the
Memory slice, since each subsystem's own keyword slice already surfaces
it with a friendlier title and snippet. In semantic mode there's only one
underlying query (`MemoryManager.searchSemantic()`), so the same tags are
used the other way around — to *route* each hit to its own hit shape
(`inboxHit`/`vaultHit`/`projectHit`/`taskHit`/`milestoneHit`/
`resourceHit`/`cardHit`) instead of excluding it; an untagged record falls
through to the generic Memory shape either way.

## REST API

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/search?q=&limit=&semantic=` | — | Merged, ranked results across Memory/Graph/Inbox/Vault/Workspace/Learning. `400` if `q` is missing. |

## CLI

`ash search <query> [--limit] [--semantic]`.

## What's not implemented

- **Graph has no semantic search** — `KnowledgeNode`s carry no embedding,
  so `{ semantic: true }` still matches Graph by label/tag substring, the
  same as keyword mode. See "How it works" above for why closing this
  needs a wider decision (an async `upsertNode`, or a slower on-demand
  embedding pass) rather than a small addition.
- **Innovation Intelligence isn't searched** — only the general,
  project-wide `AshOS.knowledgeGraph` is queried, not Innovation's own
  namespaced graph (`.ashos/innovation/graph.json`) or its
  `Opportunity`/`IntelligenceEvent` stores. Those already have their own
  purpose-built browsing surfaces (`ash innovation list/events`); folding
  them into the same merged ranking is future work if "find everything"
  needs to mean literally everything.
- **No natural-language query parsing** — a query is matched literally
  (substring/semantic), not interpreted ("what was I working on in May"
  would need a date-range-aware layer on top, not a change to
  `HybridSearch` itself).
