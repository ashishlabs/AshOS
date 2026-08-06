# AshOS — Feature Matrix

Evidence-based, generated during the audit in `implementation-status.md` —
read that file for the reasoning and file-level evidence behind every row
below. Status values: ✅ Complete, 🟡 Partial, 🔴 Not Started, ⚠ Needs
Refactor.

## AshOS Core Platform

| Feature | Status | Completion | Quality | Notes |
|---|---|---|---|---|
| Kernel (event bus, logger, permissions, plugin manager, DAG executor, config) | ✅ | 100% | High | Zero TODOs, well-tested, single shared executor used by both Planner and Workflow Engine |
| AI Providers (Anthropic/OpenAI/Ollama/LM Studio/Mock) | ✅ | 100% | High | Consistent `AIProvider` interface, raw `fetch` (no vendor SDKs), registry-resolved everywhere |
| Model Router | ✅ | 100% | High | Off by default; wired into `BaseAgent.execute()` for every agent for free |
| Tools (Shell/Git/Fs) | ✅ | 100% | High | Permission-gated for Shell/Git; Fs is ungated by design |
| Agent System + Registry | ✅ | 100% | High | 18 agents registered (root registry), capability-routed |
| Memory (4 scopes + semantic search) | ✅ | 100% | Medium | Solid substrate; full-file read-modify-write is a known scaling limit, sharpened by Second Brain's write volume |
| Outcome Memory | ✅ | 100% | High | Automatic, zero opt-in, feeds Reflection Agent |
| Planner + Task Executor | ✅ | 100% | High | Includes Verification Gate (auto-runs tests after code-producing tasks) |
| Workflow Engine | ✅ | 100% | High | `ash workflow run <file>` closes the CLI gap — reachable from CLI, REST, and SDK now |
| Scheduler | ✅ | 100% | High | `ash schedule add/list/remove` + `/scheduler` REST routes, backed by a new `ScheduleStore` for durability across process restarts — reachable from CLI, REST, and SDK now |
| Plugin System | ✅ | 100% | Medium | Local-only install path, no registry |
| REST API | ✅ | 100% | High | 80 routes (re-counted; the "50 routes" figure predates Vault/Workspace/Learning/Search/Graph-edges/Scheduler/vault-history shipping), no authentication |
| CLI (`ash`) | ✅ | 100% | High | 16 command groups |
| Dashboard shell (nav, theming, layout) | ✅ | 100% | Medium | Zero automated tests |
| Local Codebase Intelligence | ✅ | 100% (v1 scope) | High | Substring search only, no semantic code search |
| Repository Intelligence (external) | ✅ | 100% | High | Real GitHub API, cached |
| Technology Radar | ✅ | 100% | Medium | Classification quality depends on signal volume |
| Knowledge Graph (data model + population + visualization) | ✅ | 95% | High | Real, auto-populated, and now visualized in a dashboard Graph tab (force layout, colored/filterable by kind, click to highlight connections); still no `repository` nodes from external Repository Intelligence |
| Innovation Intelligence (discovery, scoring, digest) | ✅ | 100% | High | Only GitHub collector proven live in this sandbox; HN/Reddit/arXiv are real but unverified live here |
| Verification Gate | ✅ | 100% | High | On by default, tested (pass + fail paths, live-verified) |
| Multi-Agent Specialist Roles | ✅ | 95% | High | 10 of 11 named roles exist or have a direct equivalent — Reviewer, Security Auditor, DevOps, UI Designer, Architect, and Documentation Writer now shipped as real `BaseAgent` subclasses; only Video Creator remains missing |
| Real database (vs. JSON files) | 🟡 | 50% | High | `MemoryManager`'s project/global scopes — the store Inbox/Vault/Workspace/Learning/Outcome Memory all ride on — now persist to SQLite via `node:sqlite` (indexed writes + a tag index, replacing whole-file JSON read-modify-write); the Knowledge Graph and Innovation's per-file JSON stores are unchanged. See `implementation-status.md` Section 15. |

## "AI Second Brain" Vision Layer

| Feature | Status | Completion | Quality | Notes |
|---|---|---|---|---|
| Universal Inbox (capture + classify + summarize) | 🟡 | 82% | High | Real capture/classify/store/archive/history (`InboxManager.history()`, `ash inbox history`, `GET /inbox/:id/history`); classification is regex, not AI; AI summarization now real, grounded in fetched page text via `WebFetchTool` for URLs — including real PDF text extraction via `pdfjs-dist`, not just the URL string; still no voice/image capture |
| Memory Timeline | ✅ | 90% | Medium | Dashboard-only merge view; no per-record version history |
| Today's Focus widget | ✅ | 100% (for its scope) | High | Real composition of 3 live endpoints, polls every 15s |
| Idea Lab | 🟡 | 60% | High | Storage/scoring/dedup/lifecycle all real; "AI evaluation"/"market analysis" are deterministic heuristic formulas, not LLM reasoning; no related-projects link |
| Reflection Agent | ✅ | 90% | High | Real daily/weekly/monthly narrative with graceful offline fallback |
| Cross-store Hybrid Search | 🟡 | 90% | High | Real merge across Memory/Graph/Inbox/Vault/Workspace/Learning (six stores); semantic mode now covers 5 of 6 (Memory/Inbox/Vault/Workspace/Learning, one `searchSemantic()` call routed by subsystem tag) — only Graph stays keyword-only, since `KnowledgeNode`s have no embedding storage |
| Knowledge Vault | ✅ | 90% | High | `vault/` package — pages (`VaultNote`), tags, backlinks, related-notes links, revision history (`history()`/`ash vault history`/`GET /vault/:id/history`), Hybrid Search + Knowledge Graph integration all real; flashcards remain absent (they belong to Learning Hub, not Vault) |
| Project Workspace | ✅ | 78% | High | `workspace/` package — Project/Task/Milestone entities, CRUD via CLI/REST, revision history for all three (`ash project history`/`task history`/`milestone history`), a dashboard Projects tab, and computed progress tracking all real; Roadmap/Architecture-docs/Definition-of-Done/Risk-tracking as data models and AI recommendations remain deliberately out of scope |
| Learning Hub | ✅ | 68% | High | `learning/` package — tracked courses/books/videos/articles and flashcards reviewed via a real SuperMemo-2 spaced repetition implementation (`learning/srs.ts`), independently unit tested, plus revision history for both (`ash learn resource history`/`card history`); Learning paths, Quizzes, and AI recommendations remain deliberately out of scope |
| AI recommendations (dashboard-wide) | 🔴 | 0% | — | No recommendation engine exists in any subsystem |
| AI documentation generation | ✅ | 100% (for its scope) | High | `agents/documentation-agent.ts` (capability `documentation`/`docs`) generates Markdown grounded in real source — one file's actual content, or a module's real file/symbol structure — and always writes the result to disk. Direct-invoke only (CLI/REST/`runAgent()`), not planner-routed. Doesn't cover roadmap generation (see below). |
| AI roadmap generation | 🔴 | 0% | — | All roadmap docs in this repo are hand-written |

## Explicitly Not Implemented (named in earlier project audits, unchanged)

| Feature | Status | Notes |
|---|---|---|
| MCP client/server | 🔴 | No `@modelcontextprotocol/*` dependency, no code |
| Browser automation | 🔴 | No Playwright/Puppeteer dependency |
| Docker as an agent tool | 🔴 | Docker exists only as deployment infra (`Dockerfile`), not a `Tool` |
| Authentication | 🔴 | No auth dependency or code anywhere |
| Self-Improvement / Evolution Engine | 🔴 | Deliberately removed (commit `8f7400b`); rebuild gated on an explicit, still-undecided user choice |
| Creative Studio (media generation) | 🔴 | No image/video/audio provider or dependency |

**Rollup:** 22 ✅/mostly-complete rows, 8 🟡 partial rows, 8 🔴 not-started
rows across 38 tracked features.
