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
2. Semantic search extended to the Graph and Inbox slices of
   `HybridSearch`, not just Memory.
3. Dashboard automated test suite — start with the 4 newest tabs
   (Inbox, Timeline, Search, Today's Focus) since they're the least
   proven.
4. `ash workflow run <file>` CLI command (thin wrapper over the existing
   `WorkflowEngine`/REST path — no engine changes).

## Phase 2 — Close the last named North Star gap + visualize existing data

**Estimated effort:** 2-3 weeks (~1 week remaining — items 6 and half of
8 are done).
**Dependencies:** none new for agents (reuses `BaseAgent`).
**Risks:** low.
**Expected impact:** closes North Star v2 to 100%.

5. Named specialist agents: Reviewer, Security Auditor, DevOps Engineer,
   UI Designer, Architect (role-prompt subclasses of `BaseAgent`, same
   pattern as `agents/code-agent.ts`).
6. ✅ **Shipped** — interactive Knowledge Graph visualization in the
   dashboard (`GraphTab`, `dashboard/src/graph-layout.ts`, new
   `GET /graph/edges` route): force-directed layout, colored/filterable
   by kind, click to highlight a node's connections.
7. CLI/REST surface for the Scheduler (`ash schedule ...`,
   `/scheduler*`) — thin wrapper, `Scheduler` class is already complete.
8. 🟡 **Half shipped** — `WebFetchTool` exists and grounds Inbox link
   summaries in real page content; `ResearchAgent` itself still isn't
   wired to use it, and there's no dedicated *search* (topic → URLs)
   tool, only *fetch* (URL → text).

## Phase 3 — The scope decision, then the real net-new work

**Estimated effort:** 2-3 months once scoped; **do not start without an
explicit decision first.**
**Dependencies:** a persisted Project/Task entity (item 9 below) is a
prerequisite for the rest of this phase — Knowledge Vault's "related
notes," Idea Lab's "related projects," and Research Hub's "project
linking" all point back to it.
**Risks:** highest in this roadmap. Knowledge Vault and Learning Hub are
genuinely new domain logic with no existing analogue to reuse (unlike
every Second Brain feature shipped so far) — underestimating this is the
single most likely way this roadmap goes over budget.
**Expected impact:** if built, closes the three fully-unimplemented
pillars (Knowledge Vault, Project Workspace, Learning Hub) that currently
cap "Second Brain readiness" at ~35/100.

9. **Persisted Project/Task/Milestone entity** — a real CRUD data model,
   not just a Knowledge Graph label. This unblocks Project Workspace and
   partially unblocks Idea Lab/Research Hub's "related projects" gaps.
10. **Knowledge Vault** — pages, tags-as-taxonomy, backlinks, revision
    history, flashcards. The single largest scope item in this roadmap.
11. **Learning Hub** — courses, flashcards, quizzes, spaced repetition,
    learning paths. Entirely new domain, no existing subsystem to build
    on top of.
12. **A recommendation engine** for the dashboard's "AI recommendations"
    surface — depends on items 9-11 existing to have enough structured
    data to recommend over.

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
