# Hybrid Search

`HybridSearch` (`search/hybrid-search.ts`, `AshOS.search`) answers "find
everything about X" across the four stores a Second Brain capture/connect
flow actually populates — Memory, the general Knowledge Graph, the
Inbox, and the Vault — without adding a fifth search index. It's Tier 2
item 6 of `docs/second-brain-roadmap.md`, closing out that tier (the
Vault slice was added once Knowledge Vault itself shipped, see
`docs/knowledge-vault.md`).

## Quick start

```bash
ash search "langgraph"
ash search "langgraph" --semantic   # embedding similarity for the Memory slice
ash search "langgraph" --limit 5
```

Or the REST API: `GET /search?q=&limit=&semantic=`. Or the dashboard's
Search tab.

## How it works

`HybridSearch` doesn't own any storage — it queries each store's existing
lookup, then merges and ranks:

```
MemoryManager.query({ text })          — keyword: value substring match
  or MemoryManager.searchSemantic()    — embedding cosine similarity (opt-in)
        │
KnowledgeGraph.listNodes()             — keyword: label/tag substring match
        │
InboxManager.list()                    — keyword: content/tag substring match
        │
VaultManager.list()                    — keyword: title/content/tag substring match
        │
merge, sort by score desc (tie-break: newest first), slice to `limit`
```

Graph/Inbox/Vault matching is always a deterministic substring heuristic —
same "transparent heuristic over an LLM/embedding call wherever one is
good enough" convention as `codebase/indexer.ts`'s `searchIndex` — since
none of the three computes embeddings. Memory matching can opt into the
existing `MemoryManager.searchSemantic()` (best-effort, requires an
active provider; falls back to keyword matching without one, per
`MemoryManager`'s own documented behavior) via `{ semantic: true }`.

## Scoring

A single deterministic `textScore()` heuristic is shared by all four
keyword slices: exact match on title/label/content or a tag → `1.0`,
prefix match → `0.75`, substring match → `0.5`. Memory hits that only
matched through `MemoryManager.query`'s value-substring pre-filter (not
found in the key or tags) get a flat `0.4` — still a real hit, just a
weaker one, since the pre-filter doesn't distinguish key/tag matches into
a score itself. Semantic Memory hits use rank position (`searchSemantic`
returns results already ordered by cosine similarity, but doesn't expose
the raw score) converted into a comparable `0-1` value.

## Inbox and Vault items never double up as Memory hits

Neither Universal Inbox nor Knowledge Vault has a persistence engine of
its own — every `InboxItem` is a `MemoryManager` project-scope record
tagged `"inbox"`, and every `VaultNote` is one tagged `"vault"` (see
`docs/inbox.md`/`docs/knowledge-vault.md`). Without deduplication, a
query matching one of these would return it twice: once as a raw `memory`
hit (JSON dump) and once as a properly formatted `inbox`/`vault` hit.
`HybridSearch` excludes any Memory record tagged `"inbox"` or `"vault"`
from the Memory slice — the Inbox/Vault slices already surface them with
a friendlier title and snippet.

## REST API

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/search?q=&limit=&semantic=` | — | Merged, ranked results across Memory/Graph/Inbox/Vault. `400` if `q` is missing. |

## CLI

`ash search <query> [--limit] [--semantic]`.

## What's not implemented

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
