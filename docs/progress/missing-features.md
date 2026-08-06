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

6. **Dashboard automated tests.** Zero exist for what's now a 15-tab
   application (up from 11 at the original audit date — Vault, Projects,
   Graph, and Learning have all shipped their own tabs since). Every
   Second Brain UI addition shipped with no repeatable verification
   beyond manual Playwright screenshots at build time — the single
   biggest regression risk in the codebase today.

7. **Semantic search for Graph and Inbox slices**, not just Memory.
   `HybridSearch`'s `--semantic` flag only affects the Memory query today;
   Graph, Inbox, Vault, Workspace, and Learning results are always plain
   substring matching, even in "semantic" mode — a user enabling semantic
   search would reasonably
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

15. **Per-record revision history** (Memory/Inbox/Vault/Workspace/
    Learning/Knowledge Graph nodes are all overwrite-on-update, no
    version chain). Now a real, live gap rather than a hypothetical one —
    Knowledge Vault shipped, so "what did this note used to say" is an
    actual question a user can ask today with no way to answer it.

16. **Product Hunt collector** for Innovation Intelligence — same pattern
    as the five collectors already shipped, just not built yet.

17. **Accessibility depth** (only 10 `aria-*` attributes across a
    2,775-line, 15-tab dashboard — both numbers grown from 7/1,745/11 at
    the original audit date). Not broken, but thin — worth a pass once
    the higher-priority dashboard-testing gap is addressed.
