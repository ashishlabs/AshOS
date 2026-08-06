# Knowledge Vault

Knowledge Vault is curated, long-form notes with links between them —
the "second brain" layer above the Inbox's raw, unprocessed capture. It's
Tier 3 item 7 of the "Second Brain" staged plan in
`docs/second-brain-roadmap.md`: a note can be written directly, or
promoted from an existing Inbox item once it's been reviewed and is worth
keeping in a more permanent, connected form.

**Deliberately has no persistence engine of its own.** Notes are
`MemoryManager` project-scope records tagged `"vault"` — the same
JSON-file store, tag query, and best-effort semantic embedding every
other memory record already gets, the same reuse convention
`InboxManager` established. See `docs/architecture.md`'s `memory/` entry
and `docs/inbox.md`.

## Quick start

```bash
ash vault add "Rate limiting" "Token bucket vs sliding window notes." --tags backend
ash vault promote <inboxId>                 # turn an existing inbox item into a note
ash vault list                              # newest first
ash vault list --status active
ash vault show <id>
ash vault link <id> <targetId>              # link one note to another
ash vault backlinks <id>                    # notes that link to <id>
ash vault archive <id>
```

Or the REST API: `POST /vault`, `GET /vault[?status=][&tag=]`,
`GET /vault/:id`, `POST /vault/:id/archive`, `POST /vault/:id/link`,
`GET /vault/:id/backlinks`. Or the dashboard's Vault tab (create + list +
expand-to-view-links-and-backlinks + link + archive), and the "Promote to
Vault" button on each Inbox tab item.

## How it works

```
VaultManager.create(title, content, opts)
        │
VaultNote { id, title, content, tags, links: [], status: "active", ... }
        │
MemoryManager.remember("project", `vault:<id>`, note, { tags: ["vault", `vault-status:<status>`, ...tags] })
        │
best-effort: KnowledgeGraph.upsertNode({ kind: "note", label: title, ... })
             (+ a `relates-to` edge to the source Inbox item's `resource` node, if promoted)
        │
eventBus.emit("vault:created", { id, title })
```

`VaultManager.promoteFromInbox(inboxId, opts?)` is the other entry point:
it reads the Inbox item via a fresh `InboxManager`, calls `create()` with
the item's content/tags carried forward (and `sourceInboxId` set), then
marks the source item `reviewed` — the same "Promote to X" pattern
`IdeaAgent` already established for turning an Inbox item into a scored
Innovation `Opportunity`.

## A note's title is immutable

A note's `title` is set at creation and cannot be changed afterward —
`content`, `tags`, and `links` can still be edited/added after the fact.
This is a deliberate simplification, not an oversight: `KnowledgeGraph.upsertNode()`
de-dupes by `(kind, label)`, and a note's graph node uses its title as
that label, so renaming a note in place would either orphan its old graph
node or require a rename operation `KnowledgeGraph` doesn't have.
`InboxManager` has the same practical constraint today (an inbox item's
content never changes after capture) — Vault just makes the limitation
explicit instead of silent.

## Linking notes together

`VaultManager.link(id, targetId)` adds `targetId` to `id`'s `links` array
(idempotent — linking the same pair twice is a no-op the second time) and
best-effort records a `relates-to` edge between the two notes' graph
nodes. `backlinks(id)` is the inverse lookup — every note whose `links`
array contains `id` — computed by scanning `list()`, not a second stored
index, since Vault's typical size (curated notes, not raw captures) makes
an O(n) scan a non-issue.

## Knowledge Graph integration

Best-effort only — a graph write failure never fails note creation or
linking, same pattern as `InboxManager.enrichGraph()`. Every note becomes
a `note` node (new `KnowledgeNodeKind`, see `graph/types.ts`) on the
shared, project-wide `KnowledgeGraph` (`AshOS.knowledgeGraph`,
`docs/knowledge-graph.md`) — not Innovation Intelligence's own namespaced
graph. A note promoted from an Inbox item additionally gets a
`relates-to` edge to that item's `resource` node (found by matching
`data.inboxId`), so a captured link and the curated note it became can be
traced through the same graph.

## Storage

No new file. Notes live inside `.ashos/memory/project.json` as ordinary
`MemoryRecord`s with `scope: "project"`, `key: "vault:<id>"`, tagged
`vault`. `VaultManager.list()` queries by the `vault` tag and sorts by
`createdAt` descending; `get()`/`archive()`/`link()` use the record's key
directly.

## REST API

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/vault` | `{ title, content, tags?, links? }` or `{ inboxId, title? }` | Create a note, or promote an existing inbox item if `inboxId` is given; `201` with the created note, `400` if neither shape is satisfied or the `inboxId` is unknown. |
| GET | `/vault?status=&tag=` | — | List notes, optionally filtered by status and/or tag. |
| GET | `/vault/:id` | — | Fetch one note; `404` if unknown. |
| POST | `/vault/:id/archive` | — | Mark a note archived; `404` if unknown. |
| POST | `/vault/:id/link` | `{ targetId }` | Link the note to another note; `404` if either id is unknown. |
| GET | `/vault/:id/backlinks` | — | Notes that link to `:id`. |

## CLI

`ash vault add <title> <content...> [--tags]`,
`ash vault promote <inboxId> [--title]`, `ash vault list [--status] [--tag]`,
`ash vault show <id>`, `ash vault archive <id>`,
`ash vault link <id> <targetId>`, `ash vault backlinks <id>`.

## What's not implemented

- **No title editing or free-form content search beyond substring
  matching** — see "A note's title is immutable" above; `HybridSearch`'s
  Vault slice (`docs/search.md`) is the same deterministic
  substring-scoring heuristic every other non-semantic slice uses, not a
  dedicated notes search engine.
- **No wiki-style `[[note title]]` link syntax parsed out of note
  content** — links are explicit, via `ash vault link`/`POST
  /vault/:id/link`, not inferred from the text.
- **No standalone Project/Task entity** — a Vault note can be tagged, but
  there's no first-class "this note belongs to Project X" relationship
  beyond whatever a shared tag or an explicit graph edge implies. This is
  the same missing-entity gap tracked in `docs/second-brain-roadmap.md`
  Tier 3 item 7 for Project Workspaces generally.
