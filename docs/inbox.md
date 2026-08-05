# Universal Inbox

Universal Inbox is the single capture point everything enters AshOS
through — text, links, GitHub repos, YouTube videos, tweets, articles,
PDFs — auto-classified on capture. It's Tier 1 item 1 of the
"Second Brain" staged plan in `docs/second-brain-roadmap.md`, and the
piece the rest of that vision (Knowledge Vault, Idea Lab, Project
Workspaces) is designed to feed from.

**Deliberately has no persistence engine of its own.** Items are
`MemoryManager` project-scope records tagged `"inbox"` — the same
JSON-file store, tag query, and best-effort semantic embedding every
other memory record already gets, instead of a fourth JSON store next to
`memory/project.json`, `codebase/<slug>.json`, and the Innovation
`*-store.ts` files. See `docs/architecture.md`'s `memory/` entry.

## Quick start

```bash
ash inbox add "https://github.com/anthropics/claude-code"   # auto-classified as github-repo
ash inbox add "remember to review the Q3 roadmap"           # auto-classified as text
ash inbox list                                               # newest first
ash inbox list --status unread
ash inbox show <id>
ash inbox archive <id>
```

Or the REST API: `POST /inbox`, `GET /inbox[?status=]`, `GET /inbox/:id`,
`POST /inbox/:id/archive`. Or the dashboard's Inbox tab (quick capture +
list + archive).

## How it works

```
InboxManager.capture(content)
        │
classify(content)  — deterministic, offline (regex-based URL detection:
        │             github.com/youtube/twitter-x/*.pdf/else-article)
        │
InboxItem { id, content, sourceType, status: "unread", tags, ... }
        │
MemoryManager.remember("project", `inbox:<id>`, item, { tags: ["inbox", `inbox-status:<status>`, sourceType, ...tags] })
        │
best-effort: KnowledgeGraph.upsertNode({ kind: "resource", ... })
             (+ a linked `repository` node for github-repo items)
        │
eventBus.emit("inbox:captured", { id, sourceType })
```

`classify()` never calls a model or the network — same "deterministic by
default" convention as the Innovation collectors' mocks and
`codebase/indexer.ts`'s symbol extraction, so capture never blocks on
provider/network availability. It only inspects the content for a URL and
buckets it: `github-repo`, `youtube`, `tweet`, `pdf`, or a generic
`article` for any other link; content with no URL is `text`. Callers can
still pass an explicit `sourceType` (used by the `note` type, which has
no auto-detection path) or extra `tags`.

## Status lifecycle

`unread -> reviewed -> archived`, tracked via `InboxManager.updateStatus()`
(`archive()` is a convenience wrapper for the terminal state). Every
transition re-writes the same memory record (`remember()` with the same
key overwrites, per `MemoryManager`'s existing semantics) with an updated
`inbox-status:<status>` tag and emits `inbox:updated`.

## Knowledge Graph integration

Best-effort only — a graph write failure never fails the actual capture,
same pattern as `CodebaseAnalystAgent.enrichProjectNode`. Every captured
item becomes a `resource` node (new `KnowledgeNodeKind`, see
`graph/types.ts`) on the shared, project-wide `KnowledgeGraph`
(`AshOS.knowledgeGraph`, `docs/knowledge-graph.md`) — not Innovation
Intelligence's own namespaced graph. A `github-repo` item additionally
gets a `repository` node and a `relates-to` edge, so an inbox capture of
a repo link and `RepositoryAnalystAgent`'s own analysis of that repo can
eventually be connected through the same graph.

## Storage

No new file. Items live inside `.ashos/memory/project.json` as
ordinary `MemoryRecord`s with `scope: "project"`, `key: "inbox:<id>"`,
tagged `inbox`. `InboxManager.list()` queries by the `inbox` tag and
sorts by `createdAt` descending; `get()`/`archive()` use the record's key
directly.

## REST API

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/inbox` | `{ content, sourceType?, tags? }` | Capture and classify; `201` with the created item, `400` if `content` is empty. |
| GET | `/inbox?status=` | — | List items, optionally filtered by status. |
| GET | `/inbox/:id` | — | Fetch one item; `404` if unknown. |
| POST | `/inbox/:id/archive` | — | Mark an item archived; `404` if unknown. |

## CLI

`ash inbox add <content...> [--tags]`, `ash inbox list [--status]`,
`ash inbox show <id>`, `ash inbox archive <id>`.

## What's not implemented

- **Voice/image/screenshot/document capture** — text and URLs only for
  this stage. Blocked on the same media-pipeline gap `docs/roadmap.md`
  already tracks for Video/Vision/Voice agents; see
  `docs/second-brain-roadmap.md` Tier 3.
- **No LLM-generated summary on capture** — classification is
  deterministic only, unlike `DailyBriefGenerator`'s narrative
  generation. Adding a best-effort summary (same graceful-offline-fallback
  pattern) is natural future work once the capture path itself is proven.
- **No automatic promotion into Idea Lab / Knowledge Vault entities** —
  an inbox item stays an inbox item; turning one into a scored
  Innovation `Opportunity` or a richer Knowledge Vault page is Tier 2/3
  work (`docs/second-brain-roadmap.md`).
