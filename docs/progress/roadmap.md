# AshOS — Implementation Roadmap (Audit-Derived)

Ordered by leverage: what closes the most real gaps for the least new
architecture, deferring anything that requires a scope decision to the
end. This roadmap is a *reporting* artifact — it does not authorize or
schedule any work; see `missing-features.md` for the reasoning behind
each item's priority.

## Phase 1 — Close what's already started (no new architecture)

**Estimated effort:** 1-2 weeks, one engineer.
**Dependencies:** none new — every item reuses infrastructure that
already exists and is already tested.
**Risks:** low. The main risk is scope creep — each item below is
intentionally small; resist folding Phase 3-shaped work into this phase.
**Expected impact:** turns 4 currently-partial features into complete
ones, and removes the single largest regression risk in the codebase.

1. ✅ **Shipped** — AI summarization in the Inbox capture path, further
   grounded in fetched page content via a new `WebFetchTool` for
   captured URLs.
2. ✅ **Shipped (partially)** — semantic search extended to the Inbox,
   Vault, Workspace, and Learning slices of `HybridSearch` (one
   `MemoryManager.searchSemantic()` call now covers all five non-Graph
   sources, since the latter four already persist through `remember()`).
   Graph remains keyword-only — closing it needs a wider decision (async
   `KnowledgeGraph.upsertNode()` or on-demand embeddings), tracked
   separately in `missing-features.md` item 7 and `docs/search.md`.
3. ✅ **Shipped (partially)** — dashboard automated test suite
   (`dashboard/vitest.config.ts`, jsdom + React Testing Library, 16 tests
   in `graph-layout.test.ts` + `App.test.tsx`, run in CI). Covers the
   Dashboard, Inbox, Vault, Search, and Timeline tabs against a mocked
   `fetch`. Still open: the other 10 tabs (Projects, Learning, Graph,
   Plan, Workflow, Innovation, Trending, Memory, Logs, Chat).
4. `ash workflow run <file>` CLI command (thin wrapper over the existing
   `WorkflowEngine`/REST path — no engine changes).

## Phase 2 — Close the last named North Star gap + visualize existing data

**Estimated effort:** 2-3 weeks (items 5, 6, and half of 8 are done).
**Dependencies:** none new for agents (reuses `BaseAgent`).
**Risks:** low.
**Expected impact:** closes North Star v2 to 100%.

5. ✅ **Shipped** — named specialist agents: Reviewer (`review`), Security
   Auditor (`security-audit`), DevOps (`devops`), UI Designer
   (`ui-design`), Architect (`architecture`) — role-prompt subclasses of
   `BaseAgent`, same pattern as `agents/code-agent.ts`, registered in
   `sdk/ashos.ts` and reachable via the Planner (its system prompt lists
   all five capabilities), a workflow step, or `AshOS.runAgent()`
   directly. See `docs/features/multi-agent-specialist-roles.md`.
6. ✅ **Shipped** — interactive Knowledge Graph visualization in the
   dashboard (`GraphTab`, `dashboard/src/graph-layout.ts`, new
   `GET /graph/edges` route): force-directed layout, colored/filterable
   by kind, click to highlight a node's connections.
7. CLI/REST surface for the Scheduler (`ash schedule ...`,
   `/scheduler*`) — thin wrapper, `Scheduler` class is already complete.
8. ✅ **Shipped, except one piece** — `WebFetchTool` exists and grounds
   both Inbox link summaries and `ResearchAgent` output in real page
   content when the task description contains a URL (live-verified
   against a real reachable host). Still open: there's no dedicated
   *search* (topic → URLs) tool, only *fetch* (URL → text), so
   `ResearchAgent` can research a URL you give it but can't discover one
   for an arbitrary topic on its own.

## Phase 3 — now fully shipped

**Estimated effort:** none remaining. Every item in this phase shipped —
Knowledge Vault (item 10) and the persisted Project/Task/Milestone entity
(item 9) turned out not to need this phase's scope decision at all;
Learning Hub (item 11) did need genuinely new domain logic (the
SuperMemo-2 spaced repetition algorithm), but shipped anyway once
actually scoped and attempted.
**Dependencies:** none remaining.
**Risks:** none remaining for this phase — item 11 was the one carrying
real risk (new algorithmic logic with no analogue to reuse), and it's
shipped and tested (`learning/srs.ts` + `learning/srs.test.ts`).
**Expected impact:** closed all three previously fully-unimplemented
pillars (Knowledge Vault, Project Workspace, Learning Hub).

9. ✅ **Shipped, and didn't need this phase's scope decision after
    all** — Persisted Project/Task/Milestone entity (`workspace/`, see
    `docs/project-workspaces.md`): a real CRUD data model, not just a
    Knowledge Graph label, reusing the exact `MemoryManager`
    record-plus-tag pattern every other Second Brain feature uses. This
    unblocks Project Workspace outright; Idea Lab/Research Hub's "related
    projects" gaps are still open — the entity now exists, but nothing
    links an `Opportunity` or research item to a `Project` yet.
10. ✅ **Shipped, and didn't need this phase's scope decision after
    all** — Knowledge Vault (`vault/`, see `docs/knowledge-vault.md`):
    pages (`VaultNote`), tags, backlinks, related-notes links, and Hybrid
    Search/Knowledge Graph integration all reused existing infrastructure
    (`MemoryManager` records + `KnowledgeGraph` edges), the same pattern
    every other Second Brain feature in Phase 1/2 used. Revision history
    remains unbuilt (no version chain on edits); flashcards were never
    really a Vault feature, they belong to Learning Hub (item 11).
11. ✅ **Shipped** — Learning Hub (`learning/`, see `docs/learning-hub.md`):
    tracked courses/books/videos/articles, plus flashcards reviewed via a
    real, independently unit-tested SuperMemo-2 implementation
    (`learning/srs.ts`) — the one genuinely new algorithm this whole
    Second Brain roadmap needed; storage still reused the
    `MemoryManager`-record-plus-tag pattern. Quizzes and Learning paths,
    the other two named capabilities, remain deliberately out of scope —
    see that doc's "What's not implemented."
12. **A recommendation engine** for the dashboard's "AI recommendations"
    surface — depends on item 11 existing (item 9's Project/Task data
    already exists) to have enough structured data to recommend over.

## Phase 4 — Infrastructure hardening (parallel-track, not gated on Phase 3)

**Estimated effort:** 1-2 weeks per item; can run independently of the
scope decision above.
**Dependencies:** none.
**Risks:** low for the database migration in isolation; medium in that
every existing subsystem's persistence code would need updating
together, so it's a wide-touching change even though each individual
change is simple.
**Expected impact:** removes the two real scaling ceilings this audit
found before they cause an actual incident.

13. Replace whole-file JSON read-modify-write with an embedded database
    (e.g. SQLite) — still zero external services, fixes the
    full-file-rewrite-per-write and linear-scan issues.
14. Real vector index (replacing brute-force cosine similarity) once/if
    Memory or Inbox volume grows past what linear scan handles well.
15. Accessibility pass on the dashboard (ARIA labeling, keyboard nav
    audit) — independent of any other phase.

## Explicitly out of scope for this roadmap

Unchanged from prior audits, still gated on explicit user decisions, not
included in any phase above:

- **Evolution Engine revival** (self-improvement/benchmarking loop) —
  deliberately removed, rebuild requires an explicit choice, not a
  default assumption.
- **Creative Studio** (media generation) — deprioritized; least aligned
  with AshOS's local-first, free-API design.
- **Multi-user auth / shared deployment** — out of scope while AshOS
  remains a local, single-user tool by design.
