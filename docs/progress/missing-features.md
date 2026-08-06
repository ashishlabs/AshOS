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

3. **Explicit scope decision on Knowledge Vault, Project Workspace, and
   Learning Hub.** These are three of eight named pillars with *zero*
   implementation — not partial, not a thin version, nothing. Continuing
   to build adjacent features (more Inbox source types, more Search
   modes) without deciding whether these three are in scope risks a
   system that's permanently "almost a Second Brain" rather than
   definitively one thing or another.

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

5. **A persisted, standing Project/Task entity.** Tasks currently exist
   only for the duration of one Planner/TaskExecutor run; there is no
   "show me my open tasks across all projects" view, because nothing
   persists a task past its own execution. This blocks Project Workspace,
   Idea Lab's "related projects," and Research Hub's "project linking" —
   three separate gaps all trace back to this one missing entity.

6. **Dashboard automated tests.** Zero exist for an 11-tab application.
   Every Second Brain UI addition (Inbox, Timeline, Search, Today's
   Focus) shipped with no repeatable verification beyond manual
   Playwright screenshots at build time — the single biggest
   regression risk in the codebase today.

7. **Semantic search for Graph and Inbox slices**, not just Memory.
   `HybridSearch`'s `--semantic` flag only affects the Memory query today;
   Graph and Inbox results are always plain substring matching, even in
   "semantic" mode — a user enabling semantic search would reasonably
   expect it to apply everywhere.

## Medium

8. **~~A generic web-search/fetch tool.~~ Partially closed.** `WebFetchTool`
   (`tools/web-fetch-tool.ts`, capability `web-fetch`) now exists and is
   used by the Inbox's AI summarizer to ground a captured link's summary
   in the page's actual text. Still open: it's a *fetch* tool (given a
   URL, get its text), not a *search* tool (given a topic, find URLs) —
   and `ResearchAgent` itself hasn't been updated to call it, so
   "Autonomous Research" (North Star goal #8) still reasons model-only.

9. **CLI/REST surface for the Scheduler.** It's real, working
   infrastructure, but only reachable by writing SDK code — there's no
   `ash schedule ...` command and no `/scheduler` route. Blocks anyone
   wanting a recurring job (a daily digest, a nightly reflection) without
   writing a standalone script.

10. **A CLI command to run a Workflow file directly** (`ash workflow run
    <file>`). Today, running a workflow requires the REST API or the SDK
    — there's no terminal-only path, unlike everything else in the CLI.

11. **PDF/document content extraction.** Inbox detects a PDF only by URL
    file extension — it never fetches or parses the actual document. A
    "capture a PDF" flow that doesn't read the PDF is capture without
    substance.

12. **An actual embedded database** (e.g. SQLite) to replace whole-file
    JSON read-modify-write. Not urgent at current scale, but Second
    Brain's "capture everything" pattern is exactly the write-volume
    growth pattern that breaks this fastest.

## Low

13. **Voice and image capture for the Inbox.** Named in the vision, but
    blocked on the same media-pipeline gap already tracked for
    Video/Vision/Voice agents (`docs/roadmap.md`) — correctly deferred
    together rather than half-solved for Inbox alone.

14. **AI-generated documentation/roadmaps.** No agent produces either
    today; every doc in this repo, including this one, is hand-written.
    Real gap against the vision's "AI Layer" section, but low urgency —
    nothing currently depends on it.

15. **Per-record revision history** (Memory/Inbox/Knowledge Graph nodes
    are all overwrite-on-update, no version chain). Matters most once
    Knowledge Vault exists and "what did this page used to say" becomes
    a real question — low priority while Vault itself doesn't exist.

16. **Product Hunt collector** for Innovation Intelligence — same pattern
    as the five collectors already shipped, just not built yet.

17. **Accessibility depth** (only 7 `aria-*` attributes across a
    1,745-line, 11-tab dashboard). Not broken, but thin — worth a pass
    once the higher-priority Vault/Workspace/testing gaps are addressed.
