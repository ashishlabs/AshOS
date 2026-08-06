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
- ✖ **Missing:** voice capture, image capture, a distinct "bookmark" type
  (folded into generic "article"), a dedicated *search* tool (finding
  URLs for a topic — `WebFetchTool` only fetches a URL it's already
  given). Real PDF *content* extraction is **done**: `WebFetchTool` now
  extracts text from `application/pdf` responses (and `.pdf`-suffixed
  URLs served with a generic content-type) via `pdfjs-dist`, live-verified
  against a real PDF on `raw.githubusercontent.com`.
- ⚠ **Should be improved:** classification is purely regex-pattern-based
  — a URL that doesn't match one of the 5 hardcoded patterns
  (GitHub/YouTube/Twitter-X/PDF) always falls through to generic
  "article," even if it's structurally something else (e.g. a Reddit
  thread, a paper on arXiv).
- 🚀 **Next implementation step:** none outstanding for this entry.
  (`ResearchAgent` is now wired to `WebFetchTool` too — see the Research
  Hub entry below. `HybridSearch`'s semantic mode has since been extended
  to Inbox/Vault/Workspace/Learning — see the Hybrid Search entry below;
  only Graph remains keyword-only.)

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
- ⚠ **Should be improved:** none outstanding — `AshOS.startScheduledJobs()`
  already wires a default daily-reflection cron job
  (`config.reflection`), and the Scheduler's CLI/REST surface
  (`missing-features.md` item 9, now closed — see `docs/scheduler.md`)
  means a user can additionally schedule their own custom goal/workflow
  jobs the same way, e.g. `ash schedule add "0 7 * * *" --goal "..."`.
- 🚀 **Next implementation step:** none outstanding for this entry.

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

### Multi-Agent Specialist Roles (10 of 11 named roles exist or have a direct equivalent)

- ✔ **Done:** Code, Research, Testing, Git, Generic agents all real and
  registered; Reflection agent added since the last audit; Reviewer
  (`review`), Security Auditor (`security-audit`), DevOps (`devops`), UI
  Designer (`ui-design`), and Architect (`architecture`) are all real
  `BaseAgent` subclasses, each following `agents/code-agent.ts`'s shape
  (optional `task.input.file` to read for context or write the produced
  artifact). Documentation Writer (`documentation`/`docs`,
  `agents/documentation-agent.ts`) is also now real: it grounds the
  generated Markdown in actual source — a single file's real content, or
  a module directory's real file/symbol structure via Local Codebase
  Intelligence's `scanRepository` — and always writes the result to disk
  (`.ashos/generated-docs/<slug>.md` by default), closing
  `missing-features.md` item 14 ("no agent produces documentation") at
  the same time. Unlike the other five, it's deliberately **not**
  planner-routed — the Planner's `TaskGraph` never carries a structured
  `input`, and a documentation request needs a real file/dir path, not
  paraphrased prose — so it's invoked directly via `ash docs generate`,
  `POST /docs/generate`, or `runAgent("documentation", ...)`, same
  precedent as `github-trending`/`codebase-analyst`. Bringing total
  registered agents to 22. Confirmed via `agents/agents.test.ts`
  (per-agent behavior) and `sdk/ashos.test.ts` (registration under the
  correct capability).
- ✖ **Missing:** Video Creator — blocked on missing media-generation
  provider infrastructure this codebase doesn't have.
- ⚠ **Should be improved:** nothing about the existing 10 needs rework —
  this is purely a "hasn't been built yet" gap for the remaining one, not
  a quality issue.
- 🚀 **Next implementation step:** none outstanding for Documentation
  Writer. Video Creator stays deferred with Creative Studio.

---

### Research Hub (real for AI/dev ecosystem; not general-purpose)

- ✔ **Done:** GitHub/HN/Reddit/arXiv collectors, event normalization and
  dedup, Daily Brief narrative, technology radar classification — all
  real, tested code. `ResearchAgent` (`agents/research-agent.ts`) now
  grounds its summary in a URL's actual fetched text via `WebFetchTool`
  when the task description contains one — same pattern as the Inbox
  summarizer — live-verified against a real reachable host (`api.github.com`
  in this sandbox; a non-allowlisted host fails closed and falls back to
  model knowledge, exactly as designed).
- ✖ **Missing:** project linking (same missing-Project-entity gap as
  Idea Lab); a dedicated *search* tool (topic → URLs) — `ResearchAgent`
  can only research a URL it's already given, not discover one for an
  arbitrary topic on its own.
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
