# AshOS — Missing Features (Prioritized)

Every item below was confirmed absent by direct code inspection during
this audit (see `implementation-status.md` for the evidence), not
inferred from a doc or a directory name. "Why it matters" is written
against the vision this audit measures against — the "AI Second Brain"
brief plus the existing North Star roadmap.

## Critical

1. **~~AI summarization in the Inbox capture path.~~ Closed.**
   `InboxManager.capture()` now best-effort asks the active provider for
   a one-sentence summary (`InboxItem.summary`), and — for captured URLs —
   grounds it in the linked page's actual fetched text via `WebFetchTool`
   (`tools/web-fetch-tool.ts`) rather than just the URL string. Shown in
   the dashboard's Inbox tab.

2. **~~A visual Knowledge Graph in the dashboard.~~ Closed.** A **Graph**
   tab now renders the whole graph — nodes colored/filterable by kind,
   click a node to highlight its connections — via a small dependency-free
   force layout (`dashboard/src/graph-layout.ts`) over `GET /graph/nodes`
   + the new `GET /graph/edges`.

3. **~~Knowledge Vault~~ Closed. ~~Project Workspace~~ Closed.
   ~~Learning Hub~~ Closed.** All three of the vision's previously
   fully-unbuilt pillars now have real implementations. Knowledge Vault
   (`vault/`) and Project Workspace (`workspace/`) turned out not to need
   a new persistence engine, just the same
   `MemoryManager`-record-plus-`KnowledgeGraph`-edge pattern Inbox
   already established. Learning Hub (`learning/`) was the one pillar
   that genuinely needed new domain logic — the SuperMemo-2 spaced
   repetition algorithm (`learning/srs.ts`) has no prior analogue
   anywhere in this codebase — but its storage still followed the same
   reuse convention. See `docs/knowledge-vault.md`,
   `docs/project-workspaces.md`, `docs/learning-hub.md`.

## High

4. **~~Named specialist agent roles~~ Closed.** Reviewer (`review`),
   Security Auditor (`security-audit`), DevOps (`devops`), UI Designer
   (`ui-design`), and Architect (`architecture`) are now real `BaseAgent`
   subclasses with role-specific prompts, following the exact pattern
   `agents/code-agent.ts` already established — registered in
   `sdk/ashos.ts`, routable by the Planner, and reachable via
   `AshOS.runAgent()`. This closed the North Star v2 milestone to 100%.
   See `docs/features/multi-agent-specialist-roles.md`. Only
   Documentation Writer and Video Creator remain unbuilt named roles.

5. **~~A persisted, standing Project/Task entity.~~ Closed.**
   `WorkspaceManager` (`workspace/`, see `docs/project-workspaces.md`)
   now provides exactly this — `ash project task list <projectId>`
   answers "show me my open tasks for this project" with real, persisted
   data, distinct from the ephemeral `AgentTask`/`PlannedTask` objects
   that only exist during one Planner/TaskExecutor run. Idea Lab's
   "related projects" and Research Hub's "project linking" remain open —
   the entity they needed now exists, but nothing links an `Opportunity`
   or research item to a `Project` yet (no `projectId` field, no
   automatic association).

6. **~~Dashboard automated tests.~~ Partially closed.** `dashboard/` now
   has its own `vitest.config.ts` (jsdom + React Testing Library) and a
   real test suite (`graph-layout.test.ts`, `App.test.tsx`, 16 tests)
   covering 5 of the 15 tabs — Dashboard, Inbox, Vault, Search, Timeline —
   against a mocked `fetch`, wired into CI. The other 10 tabs (Projects,
   Learning, Graph, Plan, Workflow, Innovation, Trending, Memory, Logs,
   Chat) still have no coverage — a smaller, bounded backlog rather than
   the "zero tests anywhere" gap this item originally named.

7. **~~Semantic search for Graph and Inbox slices~~ Mostly closed.**
   `HybridSearch`'s `{ semantic: true }` now covers Memory, Inbox, Vault,
   Workspace, and Learning — one `MemoryManager.searchSemantic()` call,
   since the latter four already persist through `remember()` and get a
   best-effort embedding computed and indexed at capture/create time with
   no new work required; the hit is then routed back into its own
   source's friendlier shape by its subsystem tag instead of the generic
   Memory one. **Graph is still keyword-only** in both modes:
   `KnowledgeNode`s have no embedding storage, and adding it means either
   an async `KnowledgeGraph.upsertNode()` (touching ~20 synchronous call
   sites across `agents/base-agent.ts` and four subsystem managers) or a
   slower on-demand embedding pass at query time — a real, separate
   architectural decision, not a small addition. See `docs/search.md`.

## Medium

8. **~~A generic web-search/fetch tool.~~ Mostly closed.** `WebFetchTool`
   (`tools/web-fetch-tool.ts`, capability `web-fetch`) now exists and is
   used by both the Inbox's AI summarizer and `ResearchAgent`
   (`agents/research-agent.ts`) to ground a summary in a URL's actual
   fetched text — live-verified against a real reachable host. Still
   open: it's a *fetch* tool (given a URL, get its text), not a *search*
   tool (given a topic, find URLs) — `ResearchAgent` can research a URL
   you hand it, but still can't discover one for an arbitrary topic on
   its own, so "Autonomous Research" (North Star goal #8) is real but not
   fully autonomous yet.

9. **~~CLI/REST surface for the Scheduler.~~ Closed.** `ash schedule
   add/list/remove` and `POST`/`GET /scheduler`, `DELETE /scheduler/:id`
   now exist. Turned out `Scheduler` being in-memory-only meant a job
   added from a short-lived CLI/request process needed a durable
   definition to mean anything — `ScheduleStore`
   (`scheduler/schedule-store.ts`, `.ashos/schedules.json`) persists it,
   and a long-running process reads it back via
   `AshOS.loadPersistedSchedules()` (called from `startScheduledJobs()`)
   and registers it on the real `Scheduler`, dispatching to
   `AshOS.run()`/`runWorkflowFile()` when it fires — reusing both
   existing entry points, no new execution path. Live-verified end-to-end
   against the built API server. See `docs/scheduler.md`.

10. **~~A CLI command to run a Workflow file directly~~ Closed.**
    `ash workflow run <file>` (`cli/commands/workflow.ts`) reads and
    parses a workflow JSON file and runs it via the existing
    `AshOS.runWorkflowFile()` → `WorkflowEngine` path, printing per-step
    status. Also became the one shared file-loading entry point a
    `{ kind: "workflow" }` schedule target reuses (item 9 above).

11. **~~PDF/document content extraction.~~ Closed.** `WebFetchTool`
    (`tools/web-fetch-tool.ts`) now detects a PDF by `application/pdf`
    content-type or a `.pdf` URL path served with a generic/absent
    content-type (e.g. `raw.githubusercontent.com`'s
    `application/octet-stream`), and extracts its real text via
    `pdfjs-dist`'s Node-compatible legacy build (dynamically imported
    since it ships ESM-only, chosen over the `pdf-parse` wrapper to avoid
    a transitive native-binary dependency). `InboxManager` needed zero
    changes — it already calls `fetchUrlContext()` for any `detectedUrl`
    regardless of `sourceType`, so a captured `pdf`-classified item is now
    summarized against the document's actual content automatically.
    Live-verified against a real PDF fetched from
    `raw.githubusercontent.com`. Non-PDF, non-image binary formats
    (video, archives, ...) are still rejected by content-type — see item
    13 for image handling, added since.

12. **~~An actual embedded database~~ Mostly closed.** `MemoryManager`'s
    project/global scopes — the store Inbox, Vault, Workspace, Learning,
    and Outcome Memory all persist through — now use SQLite via Node's
    built-in `node:sqlite` (`.ashos/memory/project.db`,
    `~/.ashos/memory/global.db`; no `better-sqlite3` or other native
    dependency) instead of a whole-file JSON array: a `remember()` call is
    a single indexed write instead of a read-modify-write of every
    record, and `query({ tag })` — the shape every subsystem's `list()`
    actually calls — is an indexed join through a `record_tags` table
    instead of a full scan. An older `project.json`/`global.json` (plus
    its `*-revisions.json` sidecar) is imported into the new `.db` file
    once, on first open, so upgrading an existing `.ashos/` directory
    never loses captured data — live-verified against a real pre-existing
    `project.json`. `node:sqlite` requires Node 22.5+ and is still
    Node-experimental, hence the `package.json` `engines.node` bump (this
    repo's CI/Dockerfile already run Node 22, so no practical
    compatibility cost here). **Still JSON files**: the Knowledge Graph
    (both the general and Innovation-namespaced ones) and Innovation's
    per-file opportunity/event/repository-profile stores — none of them
    see Inbox-capture-level write volume, so extending this pattern to
    them is deliberately left for if/when that changes.

## Low

13. **~~Image capture for the Inbox~~ Closed (OCR only). Voice capture
    remains deferred.** `WebFetchTool` now OCRs real text out of a
    captured `image`-classified URL (`.png`/`.jpg`/`.jpeg`/`.gif`/`.bmp`/
    `.webp`, detected the same way as PDFs — content-type or a generic/
    absent content-type plus the URL extension) via `tesseract.js`, with
    its English language data bundled locally by `@tesseract.js-data/eng`
    instead of tesseract.js's default behavior of fetching it from a CDN
    at runtime — same "vendor the data file, no network call" fix as
    `pdfjs-dist`'s standard fonts. This is bounded, deliberately: it
    extracts real text (screenshots, scanned documents, memes with
    captions), not general vision *description* — a photo with no text
    correctly returns "no readable text content found," since that would
    need `AIProvider.chat()` to accept image input, a breaking interface
    change across every provider this session chose not to make.
    `InboxManager` needed no changes, same "already calls
    `fetchUrlContext()` for any `detectedUrl`" pattern as PDF. Live-
    verified end-to-end (a stubbed-network real OCR pass, since no
    reachable host in this sandbox serves a guaranteed text-bearing
    image). **Voice capture stays out of scope**: no offline/dependency-
    light speech-to-text option fits this codebase's philosophy the way
    `tesseract.js` did for OCR, so it remains blocked on the same
    media-pipeline gap tracked for Video/Vision/Voice agents
    (`docs/roadmap.md`) rather than force in a cloud-API dependency for
    one narrow feature.

14. **AI-generated documentation/roadmaps.** No agent produces either
    today; every doc in this repo, including this one, is hand-written.
    Real gap against the vision's "AI Layer" section, but low urgency —
    nothing currently depends on it.

15. **~~Per-record revision history~~ Closed** (except Knowledge Graph
    nodes, a deliberate exception — see below). `MemoryManager.remember()`
    now snapshots a record's old value into
    `.ashos/memory/{project,global}-revisions.json` immediately before an
    overwrite, exposed via `memory.revisions(scope, key)` — since
    Inbox/Vault/Workspace/Learning records are themselves Memory records,
    they all get this for free, same "extend the shared primitive once"
    pattern semantic search used. **Every one of the five now has its own
    dedicated wrapper and CLI/REST surface**: `VaultManager.history(id)`
    (`ash vault history`), `InboxManager.history(id)` (`ash inbox
    history`), `WorkspaceManager.projectHistory()`/`taskHistory()`/
    `milestoneHistory()` (`ash project history`/`task history`/`milestone
    history`), and `LearningManager.resourceHistory()`/`cardHistory()`
    (`ash learn resource history`/`card history`). **Knowledge Graph nodes
    are the one exception**: they're stored separately from
    `MemoryManager` (own JSON file, no revision tracking), so this doesn't
    apply to them — same boundary the semantic-search extension hit. No
    dashboard UI for any of the five yet — CLI/REST only.

16. **~~Product Hunt collector~~ Closed.** `innovation/collectors/product-hunt-collector.ts`
    (`product-hunt-live`, `market` domain) parses Product Hunt's public RSS
    feed — its official GraphQL v2 API requires an authenticated developer
    token this codebase doesn't ask a user for. Same per-category loop +
    dedup shape, mocked-`fetch` tests, and `liveCollectors` wiring as the
    five collectors already shipped. Like Hacker News/Reddit/arXiv/Hugging
    Face, this sandbox's `api.github.com`-only network policy blocks it
    (confirmed via a direct `curl`), so it's real, tested code awaiting an
    unrestricted environment to prove itself live.

17. **Accessibility depth** (only 10 `aria-*` attributes across a
    2,775-line, 15-tab dashboard — both numbers grown from 7/1,745/11 at
    the original audit date). Not broken, but thin — worth a pass once
    the higher-priority dashboard-testing gap is addressed.
