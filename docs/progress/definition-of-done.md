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
  `WebFetchTool` (it doesn't yet — see the Research Hub entry below) and
  extend `HybridSearch`'s semantic mode to Graph/Inbox slices, not just
  Memory.

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

### Cross-store Hybrid Search (real merge; semantic mode is Memory-only)

- ✔ **Done:** `HybridSearch` genuinely queries and merges Memory, Graph,
  and Inbox in one call, with correct dedup of Inbox items appearing
  twice (once as a raw Memory record, once via the friendlier Inbox
  view). CLI (`ash search`) and REST (`GET /search`) both support the
  `--semantic`/`semantic=` flag.
- ✖ **Missing:** semantic search for Graph and Inbox results — the flag
  only changes the Memory query's behavior; Graph/Inbox are always
  plain-substring-matched regardless of the flag.
- ⚠ **Should be improved:** the semantic flag's name/documentation should
  clarify its actual (Memory-only) scope so a user isn't surprised that
  "semantic" search still substring-matches Graph/Inbox results.
- 🚀 **Next implementation step:** compute embeddings for Graph node
  labels and Inbox item content (same best-effort pattern
  `MemoryManager.remember()` already uses) so semantic mode can apply
  uniformly across all three stores.

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

### Dashboard (6 of 9 checklist elements present)

- ✔ **Done:** home dashboard, Today's Focus widget, quick capture
  (Inbox), search, recent activity (Logs + Timeline), consistent
  nav/theming across all 11 tabs.
- ✖ **Missing:** AI recommendations, project summary, learning summary —
  all three depend on features (recommendation engine, Project entity,
  Learning Hub) that don't exist yet.
- ⚠ **Should be improved:** zero automated tests for any of the 11 tabs;
  accessibility coverage is thin (7 `aria-*` attributes total).
- 🚀 **Next implementation step:** start a dashboard test suite with the
  4 newest, least-proven tabs (Inbox, Timeline, Search, Today's Focus)
  before adding any more UI surface on top of them.
