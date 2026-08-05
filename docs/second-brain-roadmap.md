# Second Brain Gap Analysis & Roadmap

This document responds to the "AshOS vNext — AI Second Brain Upgrade" brief:
what of that vision already exists in this codebase, what's a genuine gap,
one correction to the brief's assumed tech stack, and a staged plan for
closing the highest-leverage gaps without duplicating what's already built.
It extends `docs/roadmap-v2.md` (the existing North Star gap analysis) —
read that first; this document only covers the "Second Brain" framing on
top of it.

## Stack correction

The brief's Technical Requirements section (standalone Angular components,
Angular Signals, `components.json`-driven CLI codegen) describes a
different stack than this repository. AshOS's backend is a single
TypeScript/Node package (`kernel/`, `sdk/`, `agents/`, ...), and its UI is
`dashboard/` — a separate Vite + React workspace, styled with Tailwind v4
and hand-authored shadcn/ui-style components (Radix primitives, not
Angular Material). There is no Angular anywhere in this repository and
introducing it would mean maintaining two frontend frameworks side by
side for no benefit. Everything below targets the actual stack: React
function components, hooks for state (the closest local analogue to
Angular Signals — both are fine-grained reactive primitives; introducing
`@angular/core` is not), and the existing `dashboard/src/api.ts` REST
client pattern.

## What the vision asks for that already exists

Reuse-first, per the brief's own instructions ("never duplicate
functionality"). Mapping vision section → existing module:

| Vision section | Existing AshOS module | Gap |
|---|---|---|
| AI Assistant (workspace-aware chat, "what should I work on today") | `sdk/ashos.ts` `chat()`/`plan()`/`run()`, `planner/` | Not yet fed a "workspace summary" system prompt — see Tier 1 below |
| Knowledge Graph | `graph/knowledge-graph.ts` (`KnowledgeGraph`, general-purpose instance at `.ashos/graph.json`) — already connects Projects/Agents/Tasks | Needs more node kinds populated (ideas, resources) and a dashboard visual, not a new graph engine |
| Research Hub (AI news, GitHub repos, papers, community) | `innovation/` (Innovation Intelligence) — collectors, event dedup, Daily Brief, Technology Radar | Already does almost exactly this for the AI/dev ecosystem; scope is intentionally narrower than "any topic" (see `docs/roadmap-v2.md` #8) |
| Idea Lab (score, rank, evaluate ideas) | `innovation/opportunity/` (`ScoringEngine`, `OpportunityEngine`, 15-dimension scoring), `innovation/lifecycle.ts` | Sourced only from Innovation collectors today, not from user-authored ideas — Universal Inbox (Tier 1 below) is the missing feed |
| Memory Timeline / "everything ever created" | `kernel/event-bus.ts` (`getHistory()`), `memory/memory-manager.ts` | No unified, searchable timeline UI yet — data already exists, needs a view |
| Smart Agents: Planner, Reflection, Learning, Idea | `planner/`, `agents/outcome.ts` (Outcome Memory), `innovation/opportunity/`, `innovation/profile/` (`BuilderProfileStore`) | Reflection Agent (daily/weekly/monthly review narrative) doesn't exist as a named capability yet — Tier 2 |
| AI Search (hybrid keyword/semantic/NL) | `memory/vector-store.ts` + `MemoryManager.searchSemantic()` | Scoped to Memory records only, not Knowledge Graph/Inbox/Innovation — Tier 2 |
| Daily Brief | `innovation/brief/` (`DailyBriefGenerator`) | Scoped to Innovation opportunities; doesn't yet pull in Inbox/tasks/projects — Tier 2 |
| Dashboard home screen | `dashboard/src/App.tsx` `DashboardTab` | Needs new widgets (Inbox unread count, quick capture) once Inbox exists |

**Conclusion**: most of the "Second Brain" vision is a recombination and
UI layer over subsystems that already exist (Memory, Knowledge Graph,
Innovation Intelligence, Outcome Memory, Codebase Intelligence), not new
architecture. The one genuinely missing piece with no existing analogue —
and the one everything else in the brief depends on as its entry point
("Everything enters AshOS through one inbox") — is **Universal Inbox**.
Knowledge Vault, Project Workspaces, and Learning Hub are real gaps too,
but they're consumers of Inbox + Knowledge Graph, not independent
subsystems — building them before Inbox exists would mean inventing a
second, parallel capture path.

## Staged plan

### Tier 1 — build now, no new architecture, unblocks everything else

1. ✅ **Universal Inbox** (shipped). A single capture point
   (`ash inbox add`, `POST /inbox`) that deterministically classifies
   content (text/url/github-repo/youtube/tweet/article/pdf), persists via
   the *existing* `MemoryManager` (project scope, tagged `inbox`) instead
   of a new datastore, and best-effort links into the *existing*
   `KnowledgeGraph` as `resource` nodes. No new persistence engine, no new
   UI framework — reuses `Memory` + `KnowledgeGraph` + the `dashboard/src/App.tsx`
   tab pattern. File/voice/image capture (the brief's "voice notes,
   images, screenshots") is out of scope for this stage — same
   media-pipeline gap already tracked in `docs/roadmap.md` for
   Video/Vision/Voice agents — text and URL capture (the majority of real
   "second brain" capture volume) ships now.
2. ✅ **Memory Timeline view** (shipped). Dashboard `Timeline` tab merging
   `GET /events` + `GET /memory` into one chronological, searchable feed
   — zero new backend code, exactly as scoped. Filters out the `log`
   event (mirrors every other event 1:1, see `kernel/kernel.ts`) and
   `memory:updated` (duplicates the richer memory record already shown),
   maps every other event name to a one-line human summary, and merges
   in Inbox captures for free (`inbox:captured` was already on the bus).
3. ✅ **Dashboard "Today's Focus" widget** (shipped). Full-width card at
   the top of `DashboardTab` surfacing unread Inbox count, the
   top-scored Innovation opportunity, and the most recent Outcome Memory
   failures — pure composition of three already-shipped read APIs
   (`GET /inbox?status=unread`, `GET /innovation/opportunities?limit=1`,
   `GET /memory?tag=failure`, the last needing a small `memoryQuery()`
   addition to the dashboard's API client since the REST route already
   supported a `tag` filter). No backend changes.

### Tier 2 — new agents/prompts over existing infra

4. ✅ **Idea Agent** (shipped). `IdeaAgent` (`innovation/agents/idea-agent.ts`,
   capability `idea`) promotes an Inbox item or raw text into a scored
   `Opportunity` by reusing the exact discovery-cycle pipeline
   (`Signal` → `EventStore` → namespaced Knowledge Graph → Builder
   Profile → `OpportunityEngine`/`ScoringEngine`) instead of a second
   scoring engine — deduping/combining near-duplicate ideas falls out of
   `OpportunityEngine`'s existing Jaccard tag-overlap merge for free.
   `ash innovation idea capture [content] [--inbox <id>]`, `POST
   /innovation/ideas`, and a "Promote to Idea" button on each Inbox tab
   item that shows the resulting opportunity's title/score inline. See
   `docs/innovation.md`'s "Idea Agent" section.
5. ✅ **Reflection Agent** (shipped). `ReflectionAgent` (`agents/reflection-agent.ts`,
   capability `reflection`) generates a daily/weekly/monthly review
   narrative, same shape as `DailyBriefGenerator` — deterministic data
   gathering (`agents/reflection.ts`, independently unit tested) then a
   best-effort LLM narrative with a graceful offline fallback — but
   reading Outcome Memory + Inbox + (general) Knowledge Graph activity
   within the period window instead of Innovation opportunities.
   `ash reflect [daily|weekly|monthly]`, `GET /reflect?period=`, and an
   on-demand "Reflection" card on the Dashboard tab (period selector +
   Generate button, same pattern as the Daily Innovation Brief card so
   neither auto-polls a provider call).
6. **Cross-store hybrid search** — extend `MemoryManager.searchSemantic()`
   or add a thin aggregator that also queries `KnowledgeGraph.listNodes()`
   and Inbox items, so "find everything about LangGraph" spans all three.

### Tier 3 — needs explicit scoping before building

7. **Knowledge Vault / Project Workspaces as first-class entities** —
   these imply new persisted entity types (a `Project` record, not just a
   Knowledge Graph `project` node) with their own CRUD surface. Worth
   doing once Inbox proves the capture→graph pattern.
8. **Learning Hub** (flashcards, spaced repetition, quizzes) — genuinely
   new domain logic, no existing analogue to reuse. Biggest net-new scope
   in the whole brief.
9. **Voice/image/screenshot capture** — blocked on the same media-pipeline
   gap `docs/roadmap.md` already tracks for Video/Vision/Voice agents;
   revisit together, not separately, once that's scoped.

## Shipped so far

- **Tier 1 item 1 — Universal Inbox**: `inbox/` package, `AshOS.inbox`,
  `ash inbox add/list/show/archive` CLI, `/inbox*` REST routes, and a
  dashboard Inbox tab for quick capture + review. See `docs/inbox.md`
  for the subsystem's own detailed design, following the same
  per-subsystem doc convention as `docs/codebase-intelligence.md` and
  `docs/knowledge-graph.md`.
- **Tier 1 item 2 — Memory Timeline view**: dashboard-only `Timeline`
  tab (`dashboard/src/App.tsx`'s `TimelineTab`) merging `GET /events`
  and `GET /memory` into one chronological, keyword-filterable feed. No
  backend changes.
- **Tier 1 item 3 — "Today's Focus" widget**: `TodaysFocusCard` at the
  top of `DashboardTab`, composing three existing read endpoints into
  "what's waiting for you, right now" — unread Inbox count, the
  top-scored Innovation opportunity, and the most recent Outcome Memory
  failures. Tier 1 of the Second Brain roadmap is now fully shipped.
