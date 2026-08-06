# Learning Hub

Learning Hub tracks courses/books/videos/articles and reviews flashcards
via the SuperMemo-2 (SM-2) spaced repetition algorithm. It's the one
Second Brain pillar that's genuinely new domain logic (`docs/second-brain-roadmap.md`
Tier 3 item 8) rather than a recombination of an existing AshOS pattern —
Inbox/Vault/Workspace all reuse the same capture-plus-graph shape, but no
prior AshOS subsystem does spaced repetition scheduling.

**Still has no persistence engine of its own, though.** Resources and
flashcards are `MemoryManager` project-scope records tagged
`"learning-resource"`/`"learning-flashcard"` — the same reuse convention
`InboxManager`/`VaultManager`/`WorkspaceManager` established, even though
the domain logic on top of that storage (SM-2) is new. See
`docs/architecture.md`'s `memory/` entry.

## Quick start

```bash
ash learn resource add "Deep Learning Specialization" --type course --tags ml
ash learn resource list
ash learn resource list --status in-progress
ash learn resource status <id> completed

ash learn card add "What is SM-2?" "A spaced repetition algorithm"
ash learn card list --due            # cards ready to review now
ash learn card review <id> good      # again | hard | good | easy
```

Or the REST API: `POST/GET /learning/resources`, `GET /learning/resources/:id`,
`POST /learning/resources/:id/status`, `POST/GET /learning/cards`,
`GET /learning/cards/:id`, `POST /learning/cards/:id/review`. Or the
dashboard's **Learning** tab (a Flashcards review card — front, "Show
answer," then grade — above a Resources tracker card).

## The SM-2 spaced repetition algorithm

`learning/srs.ts`'s `sm2()` is a pure, independently unit-tested function
implementing the classic SuperMemo-2 algorithm (the basis for most
flashcard apps, including a variant of Anki's default scheduler):

- Every `Flashcard` tracks `{ interval, easeFactor, repetitions }`.
  `easeFactor` starts at `2.5` and floors at `1.3`.
- A review passes in a `quality` score from 0-5. Below 3, the card was
  forgotten: `repetitions` resets to 0 and `interval` resets to 1 day.
  3 and above advances the card: the first successful review sets
  `interval = 1`, the second sets `interval = 6`, and every one after
  that multiplies the current interval by the ease factor (so a
  consistently well-recalled card gets reviewed less and less often).
- `easeFactor` itself adjusts up for an easy recall and down for a hard
  one, via the same formula as the original SM-2 paper.

`LearningManager.reviewCard(id, grade)` translates an Anki-style named
grade (`"again"`/`"hard"`/`"good"`/`"easy"`, a nicer CLI/REST/dashboard
interface than a raw number) into SM-2's 0-5 `quality` scale via
`GRADE_TO_QUALITY`, calls `sm2()`, and persists the result with
`dueDate = now + interval days`. `listCards({ due: true })` (aliased by
`ash learn card list --due` and the dashboard's Flashcards card) filters
to cards whose `dueDate` has already passed.

## Resources are separate from flashcards

A `LearningResource` (course/book/video/article) tracks progress through
external material via a simple status: `"to-learn" -> "in-progress" ->
"completed"`. It has nothing to do with SM-2 — there's no spaced
repetition over "have I finished this course," just a status you
advance manually. Flashcards are the separate, SM-2-scheduled mechanism
for the things you actually want to memorize (which might reference a
resource in their content, but there's no structural link between the
two — see "What's not implemented" below).

## A resource's title is immutable

Same constraint, and the same reason, as a Vault note's title or a
Workspace project's name (see `docs/knowledge-vault.md`/
`docs/project-workspaces.md`): a resource's `title` doubles as its
Knowledge Graph node's dedup key. `status`/`notes`/`tags` can still
change after creation.

## Flashcards deliberately get no Knowledge Graph nodes

Every `LearningResource` becomes a `learning-resource` node (new
`KnowledgeNodeKind`, see `graph/types.ts`), the same pattern every other
Second Brain entity follows. Flashcards do not — a real deck can hold
hundreds or thousands of cards, and a node per card would add graph
noise (`upsertNode`/`listNodes` scans) with no meaningful new
*connections* to show; a flashcard's only real relationship is to itself
over time (its own review history), which the SM-2 state already
captures without needing a graph edge.

## Storage

No new file. Resources and flashcards live inside `.ashos/memory/project.json`
as ordinary `MemoryRecord`s with `scope: "project"`, keyed
`learning-resource:<id>` / `learning-flashcard:<id>`, tagged accordingly.
`LearningManager.listResources()`/`listCards()` query by the general tag
and filter in-memory — the same "simpler than a compound tag query, cheap
at this scale" tradeoff `WorkspaceManager` makes for its per-project task
filtering.

## REST API

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/learning/resources` | `{ title, type, url?, notes?, tags? }` | Track a new resource; `201`, `400` if `title`/`type` are missing. |
| GET | `/learning/resources?status=&type=` | — | List resources, optionally filtered. |
| GET | `/learning/resources/:id` | — | Fetch one resource; `404` if unknown. |
| POST | `/learning/resources/:id/status` | `{ status }` | Update a resource's status; `404` if unknown. |
| GET | `/learning/resources/:id/history` | — | Prior versions of the resource, newest first. See `docs/knowledge-vault.md`'s "Revision history" section. |
| POST | `/learning/cards` | `{ front, back, tags? }` | Add a flashcard, due immediately; `201`, `400` if `front`/`back` are missing. |
| GET | `/learning/cards?due=true` | — | List flashcards, optionally filtered to only those due now. |
| GET | `/learning/cards/:id` | — | Fetch one flashcard; `404` if unknown. |
| POST | `/learning/cards/:id/review` | `{ grade }` | Grade a review (`"again"`/`"hard"`/`"good"`/`"easy"`) and reschedule via SM-2; `404` if unknown. |
| GET | `/learning/cards/:id/history` | — | Prior versions of the flashcard, newest first — grows by one entry per review. |

## CLI

`ash learn resource add <title> --type <type> [--url] [--tags]`,
`ash learn resource list [--status] [--type]`, `ash learn resource show <id>`,
`ash learn resource status <id> <status>`, `ash learn resource history <id>`,
`ash learn card add <front> <back> [--tags]`,
`ash learn card list [--due]`, `ash learn card show <id>`,
`ash learn card review <id> <grade>`, `ash learn card history <id>`.

## What's not implemented

- **No Quizzes** — a distinct concept from flashcards (question banks,
  multi-choice scoring) that was never in scope here.
- **No Learning paths** — sequencing resources/cards into a structured
  curriculum. Resources and cards are both flat, independently-tracked
  lists today.
- **No AI recommendations** ("what should I study next," AI-generated
  flashcards from a resource's content) — nothing reasons over
  learning state yet.
- **No structural link between a resource and the flashcards made from
  it** — a card's `tags` can informally reference a resource (or a
  shared tag), but there's no `resourceId` field.
- **No revision-history/analytics view** (retention rate over time,
  cards-per-day charts) — `reviewCount`/`lastReviewedAt` are stored per
  card, but nothing aggregates them into a dashboard yet.
