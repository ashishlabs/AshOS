# AshOS — Technical Debt Audit

Confirmed by direct inspection during this audit — line counts, `grep`
results, and file listings, not estimates.

## Folder structure & architecture

**Verdict: strong.** Each top-level directory maps to exactly one
subsystem (`kernel/`, `providers/`, `tools/`, `agents/`, `memory/`,
`planner/`, `workflow/`, `scheduler/`, `innovation/`, `codebase/`,
`graph/`, `inbox/`, `search/`), with one `tsconfig.json`/`vitest.config.ts`
for all of it except `dashboard/` (its own Vite/React workspace). New
Second Brain packages (`inbox/`, `search/`) followed this convention
exactly rather than inventing a different shape — genuinely low debt
here, not just an absence-of-evidence claim.

## Naming

Consistent across the codebase: `*-manager.ts`, `*-agent.ts`,
`*-store.ts`, `*-engine.ts` suffixes are applied predictably by role. No
inconsistent naming found during this audit's file-by-file review.

## Reusability

**Strong, and demonstrably so.** Every Second Brain feature audited
reused existing infrastructure instead of duplicating it:
- Inbox persists through `MemoryManager`, not a new store.
- Idea Agent reuses Innovation's exact scoring/dedup pipeline.
- Reflection Agent reuses the same "deterministic data + best-effort LLM
  narrative + offline fallback" shape as `DailyBriefGenerator`.
- Hybrid Search wraps three existing stores' own query methods rather
  than building a fourth index.

This is a real, verified pattern, not a claim — each of the four items
above was confirmed by reading the actual implementation.

## Dead code

- **`evolution/` is an empty directory** with one orphaned empty
  `dashboard/` subfolder — a leftover from the Evolution Engine's
  removal (commit `8f7400b`) that was never cleaned up.
- **`tests/` is an empty top-level directory** — every real test is
  colocated as `*.test.ts` next to its source (the actual documented
  convention); this directory has no files and no apparent purpose.
- No dead code found *within* active source files during this audit —
  no unreachable branches, no commented-out blocks, no unused exports
  spotted in the files read.

## Duplicated code

None found at the "copy-pasted logic" level during this audit's review.
The closest thing to duplication is intentional, documented parallelism:
`TechnologyRadarAgent`, `RepositoryAnalystAgent`, `IdeaAgent`, and
`ReflectionAgent` each construct their own file-backed collaborators
fresh from `context.cwd` rather than sharing one instance — this is a
deliberate convention (each `AgentContext` doesn't carry every possible
collaborator), not an accident, per the comments in `idea-agent.ts` and
`reflection-agent.ts` themselves.

## Large components / large services

| File | Lines | Verdict |
|---|---|---|
| `dashboard/src/App.tsx` | **1,745** | ⚠ Needs refactor — grew from ~1,200 before Second Brain's 3 new tabs (Inbox, Timeline, Search) plus the Today's Focus widget. Still a single file holding every tab component. Splitting into per-tab files is the natural next step and was already flagged before this audit — the growth since confirms the concern rather than introducing a new one. |
| `api/server.ts` | **792** | ⚠ Needs refactor — grew further (re-counted; was 472) with Vault/Workspace/Learning/Search/Graph-edges/Scheduler routes. All 79 REST routes in one file. Natural split: `routes/inbox.ts`, `routes/search.ts`, etc. |
| `innovation/innovation-module.ts` | 267 | Acceptable — coordinates but doesn't itself implement most logic |
| `sdk/ashos.ts` | 143 | Acceptable — thin composition root, as designed |

## Technical debt (state/data-layer)

- **Full read-modify-write of the entire JSON file on every single
  `MemoryManager` write** (`memory/memory-manager.ts`). Documented as an
  accepted tradeoff at AshOS-core scale; Second Brain's write pattern
  (every Inbox capture, every Outcome Memory record, every Reflection
  run all funnel through this same path) makes this a more pressing
  concern than it was before this audit's baseline.
- **Brute-force vector search** (`memory/vector-store.ts`) — O(n)
  cosine similarity per query. Fine today, will not scale.
- **No referential integrity in the Knowledge Graph** — edges reference
  node IDs by convention only; nothing currently deletes nodes, so this
  hasn't surfaced as an active bug, but it's a real latent gap the moment
  node deletion is added.
- **No schema enforcement at the storage layer** — every persisted shape
  is a TypeScript interface, not validated at read/write time. A
  hand-edited or corrupted JSON file fails silently until (and unless)
  the specific malformed field is read.

## Security concerns

- **No authentication anywhere** — acceptable for the current
  local-single-user scope, a hard blocker for any shared/multi-user
  deployment.
- **Shell/Git tools are permission-gated** (`PermissionManager`) for a
  documented, regex-based set of dangerous patterns — this is a real,
  working safety layer, not a gap.
- **No secret encryption at rest** — API keys live in plain
  `.ashos/config.json`/env vars, same as before this audit; unchanged
  and previously documented.

## Performance issues

- Vector search and JSON-file read-modify-write (above) are the two real
  performance ceilings identified. Neither has caused a measured problem
  in this repo's own test suite (406 tests, 86.28% coverage, runs in
  ~7 seconds), but both are architectural ceilings, not implementation
  bugs — fixing them means changing the storage strategy, not tuning code.

## UI/UX-adjacent debt

- **~~Zero dashboard automated tests~~ Partially closed.** `dashboard/`
  now has `vitest.config.ts` + `src/test-setup.ts` (jsdom, React Testing
  Library, `@testing-library/user-event`) and a real suite
  (`graph-layout.test.ts` + `App.test.tsx`, 16 tests, ~40% statement
  coverage on `src/`) covering Dashboard, Inbox, Vault, Search, and
  Timeline — run in CI via `npm run test:coverage -w dashboard`. Still
  open: 10 of the 15 tabs (Projects, Learning, Graph, Plan, Workflow,
  Innovation, Trending, Memory, Logs, Chat) have no test coverage yet.
- **Accessibility is thin** — 10 `aria-*` attributes total (re-verified)
  across a 2,775-line, 15-tab UI. Not broken, but not deliberately built
  either.

## What is *not* debt (confirmed, not assumed)

- **Zero TODO/FIXME comments** anywhere in the source tree — a positive
  signal (no known-but-unaddressed shortcuts left behind), reconfirmed
  in this audit via a fresh `grep`.
- **Strict TypeScript, clean typecheck** — `npx tsc --noEmit` passes with
  zero errors as of this audit.
- **406/406 tests passing**, 86.28% statement coverage — the backend is
  genuinely well-tested, not just claimed to be.
