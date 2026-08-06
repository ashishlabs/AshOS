# AshOS — Definition of Done Audit

For every feature this audit found **partially** complete (🟡 in
`feature-matrix.md`). Fully-complete (✅) and fully-unstarted (🔴)
features are excluded — a DoD audit only has meaning for something
in-between. See `implementation-status.md` for the underlying evidence
behind every claim below.

---

**Knowledge Graph** graduated out of this file — data model, population,
and a dashboard visualization (`GraphTab`, force layout, click-to-highlight
connections) are all now real; see `feature-matrix.md`. One latent item
carried forward: node deletion still has no referential-integrity
handling for orphaned edges (moot today since nothing deletes nodes).

---

### Universal Inbox (capture/classify/store/summarize real; still no rich media)

- ✔ **Done:** `capture()`/`list()`/`get()`/`archive()` fully implemented
  and tested, deterministic regex classification into 6 source types,
  reuses `MemoryManager` for persistence (no new store), best-effort
  Knowledge Graph enrichment with a real `repository` node for GitHub
  links, CLI (`ash inbox add/list/show/archive`) and REST (4 routes),
  dashboard `InboxTab` with a "Promote to Idea" action. **AI
  summarization now real**: a best-effort LLM call (`InboxManager.summarize()`)
  produces a one-sentence `InboxItem.summary`, shown in the dashboard.
  When the captured content contains a URL, `WebFetchTool`
  (`tools/web-fetch-tool.ts`) best-effort fetches the linked page's
  readable text first and folds it into the summarization prompt, so
  the summary reflects what the link is actually about — not just a
  generic inference from the URL string alone.
- ✖ **Missing:** voice capture, image capture, real PDF *content*
  extraction (`WebFetchTool` rejects non-text content-types by design —
  it fetches HTML/plain-text pages, not documents), a distinct
  "bookmark" type (folded into generic "article"), a dedicated
  *search* tool (finding URLs for a topic — `WebFetchTool` only fetches
  a URL it's already given).
- ⚠ **Should be improved:** classification is purely regex-pattern-based
  — a URL that doesn't match one of the 5 hardcoded patterns
  (GitHub/YouTube/Twitter-X/PDF) always falls through to generic
  "article," even if it's structurally something else (e.g. a Reddit
  thread, a paper on arXiv).
- 🚀 **Next implementation step:** wire `ResearchAgent` to use the same
  `WebFetchTool` (it doesn't yet — see the Research Hub entry below).
  (`HybridSearch`'s semantic mode has since been extended to Inbox/Vault/
  Workspace/Learning — see the Hybrid Search entry below; only Graph
  remains keyword-only.)

---

### Idea Lab (storage/scoring/dedup real; "AI evaluation" is a heuristic, not AI)

- ✔ **Done:** `IdeaAgent` promotes Inbox items or raw text into scored,
  deduped `Opportunity` records via the exact pipeline Innovation
  Intelligence's collectors already use; real Jaccard tag-overlap
  duplicate detection; full lifecycle state machine; CLI/REST/dashboard
  surfaces all wired and tested.
- ✖ **Missing:** any actual LLM reasoning about an idea's merit (scoring
  is pure arithmetic over signal confidence/domain presence); any link
  from an idea/opportunity to a Project entity (because none exists).
- ⚠ **Should be improved:** the brief's "AI evaluation" and "market
  analysis" language should either be renamed to reflect what this
  actually is (a deterministic heuristic score) or the feature should be
  extended with a real LLM-based evaluation pass — presenting the current
  heuristic as "AI evaluation" without qualification would overstate it.
- 🚀 **Next implementation step:** add an optional LLM-based qualitative
  pass (e.g. `context.provider.chat()` producing a short "why this
  might/might not work" narrative) alongside the existing numeric score,
  rather than replacing the fast, free, deterministic scoring.

---

### Reflection Agent (real, but check its actual completeness honestly)

- ✔ **Done:** daily/weekly/monthly narrative generation, deterministic
  data gathering from Outcome Memory + Inbox + Knowledge Graph, real LLM
  narrative with a graceful offline fallback when data is empty or the
  provider call fails, CLI (`ash reflect`) and REST (`GET /reflect`)
  surfaces, on-demand dashboard card.
- ✖ **Missing:** nothing scoped — this is the most complete of the
  Second Brain additions.
- ⚠ **Should be improved:** reflections are generated on-demand only;
  there's no scheduled/automatic reflection (would need the Scheduler's
  missing CLI/REST surface — see `missing-features.md` item 9 — to be
  fully useful hands-off).
- 🚀 **Next implementation step:** once Scheduler has a CLI/REST surface,
  wire a default "generate a daily reflection every morning" job as a
  reference example.

---

### Cross-store Hybrid Search (real merge; semantic mode is Graph-only gap now)

- ✔ **Done:** `HybridSearch` genuinely queries and merges all six stores
  in one call, with correct dedup of Inbox/Vault/Workspace/Learning items
  appearing twice (once as a raw Memory record, once via each subsystem's
  friendlier view). CLI (`ash search`) and REST (`GET /search`) both
  support the `--semantic`/`semantic=` flag. **`{ semantic: true }` now
  covers Memory, Inbox, Vault, Workspace, and Learning** — one
  `MemoryManager.searchSemantic()` call, routed back into each source's
  own hit shape by its subsystem tag, since those four already persist
  through `remember()` and get an embedding computed at capture/create
  time with no new indexing work needed.
- ✖ **Missing:** semantic search for Graph results — `KnowledgeNode`s have
  no embedding storage, so Graph stays plain-substring-matched regardless
  of the flag.
- ⚠ **Should be improved:** none — the semantic flag's documentation
  (`docs/search.md`) now explicitly scopes what it covers and why Graph
  is the one exception.
- 🚀 **Next implementation step:** decide how to add embeddings to Graph
  nodes — either make `KnowledgeGraph.upsertNode()` async and update its
  ~20 synchronous call sites (`agents/base-agent.ts` plus four subsystem
  managers), or accept a slower on-demand embedding pass at query time.
  This is a real architectural decision, not a small addition — see
  `docs/search.md`'s "What's not implemented" section.

---

### Multi-Agent Specialist Roles (9 of 11 named roles exist or have a direct equivalent)

- ✔ **Done:** Code, Research, Testing, Git, Generic agents all real and
  registered; Reflection agent added since the last audit; Reviewer
  (`review`), Security Auditor (`security-audit`), DevOps (`devops`), UI
  Designer (`ui-design`), and Architect (`architecture`) are now also
  real `BaseAgent` subclasses, each following `agents/code-agent.ts`'s
  shape (optional `task.input.file` to read for context or write the
  produced artifact) — bringing total registered agents to 21. Confirmed
  via `agents/agents.test.ts` (per-agent behavior) and
  `sdk/ashos.test.ts` (registration under the correct capability).
- ✖ **Missing:** Documentation Writer, Video Creator — confirmed absent
  via grep across `agents/` and `innovation/agents/`. Video Creator is
  additionally blocked on missing media-generation provider
  infrastructure this codebase doesn't have.
- ⚠ **Should be improved:** nothing about the existing 9 needs rework —
  this is purely a "hasn't been built yet" gap for the remaining two, not
  a quality issue.
- 🚀 **Next implementation step:** build Documentation Writer as a
  `BaseAgent` subclass with a role-specific system prompt — no new tools
  or infrastructure required, same pattern as the five specialists just
  shipped. Video Creator stays deferred with Creative Studio.

---

### Research Hub (real for AI/dev ecosystem; not general-purpose)

- ✔ **Done:** GitHub/HN/Reddit/arXiv collectors, event normalization and
  dedup, Daily Brief narrative, technology radar classification — all
  real, tested code.
- ✖ **Missing:** project linking (same missing-Project-entity gap as
  Idea Lab); a generic web-search/fetch tool for arbitrary topics beyond
  the AI/dev ecosystem the collectors are scoped to.
- ⚠ **Should be improved:** only the GitHub collector is proven reachable
  from this project's own development sandbox — HN/Reddit/arXiv should
  be verified live from an unrestricted environment before being relied
  upon in production use.
- 🚀 **Next implementation step:** verify the three unproven collectors
  against the live internet, then build the generic web-search tool
  (`missing-features.md` item 8) as the next research-breadth expansion.

---

### Dashboard (7 of 9 checklist elements present)

- ✔ **Done:** home dashboard, Today's Focus widget, quick capture
  (Inbox), search, recent activity (Logs + Timeline), consistent
  nav/theming across all 15 tabs. Project and Learning Hub entities now
  exist too (their own dedicated Projects/Learning tabs), even though
  neither is summarized on the Dashboard home tab specifically — see below.
- ✖ **Missing:** AI recommendations (no recommendation engine exists in
  any subsystem); a Dashboard-home-tab project summary and learning
  summary widget — the underlying `Project`/`LearningResource` entities
  both exist now, but nothing pulls them into `DashboardTab` the way
  `TodaysFocusCard` does for Inbox/Innovation/Outcome Memory.
- ✔ **Done:** ~~zero automated tests for any of the 15 tabs~~ Closed. A
  real dashboard test suite now exists (`dashboard/vitest.config.ts`,
  jsdom + React Testing Library + `@testing-library/user-event`, 16 tests
  across `graph-layout.test.ts` and `App.test.tsx`) covering the Dashboard
  tab's data loading (Today's Focus, Reflection, Status, Recent activity,
  including an API-unreachable error path), the Inbox capture flow, the
  Vault create-note flow, the Search flow (results and empty state), and
  the Timeline tab (event/memory merge-and-sort plus keyword filtering) —
  all against a mocked `fetch` per `dashboard/src/api.ts`'s real endpoint
  paths, no live network. Wired into CI (`.github/workflows/ci.yml`) and
  `npm run dashboard:test` at the root. See `CLAUDE.md`'s Commands section.
- ⚠ **Should be improved:** accessibility coverage is thin (10 `aria-*`
  attributes total across a 2,775-line, 15-tab UI); coverage on `App.tsx`
  itself is still partial (~35% statements) — the 5 tabs above are
  covered, the remaining 10 (Projects, Learning, Graph, Plan, Workflow,
  Innovation, Trending, Memory, Logs, Chat) are not yet.
- 🚀 **Next implementation step:** extend the same RTL pattern to the
  remaining 10 tabs, prioritizing Vault backlinks/note-linking and Graph's
  node-selection interaction next (the two with the most non-trivial
  client-side state), then tackle the accessibility pass.
