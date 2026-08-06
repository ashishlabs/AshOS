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
| Agent System + Registry | ✅ | 100% | High | 17 agents registered, capability-routed |
| Memory (4 scopes + semantic search) | ✅ | 100% | Medium | Solid substrate; full-file read-modify-write is a known scaling limit, sharpened by Second Brain's write volume |
| Outcome Memory | ✅ | 100% | High | Automatic, zero opt-in, feeds Reflection Agent |
| Planner + Task Executor | ✅ | 100% | High | Includes Verification Gate (auto-runs tests after code-producing tasks) |
| Workflow Engine | ✅ | 100% (infra) | Medium | No CLI command to run a workflow file — REST/SDK only |
| Scheduler | ✅ | 100% (infra) | Medium | No CLI or REST surface at all — SDK-only |
| Plugin System | ✅ | 100% | Medium | Local-only install path, no registry |
| REST API | ✅ | 100% | High | 50 routes, no authentication |
| CLI (`ash`) | ✅ | 100% | High | 16 command groups |
| Dashboard shell (nav, theming, layout) | ✅ | 100% | Medium | Zero automated tests |
| Local Codebase Intelligence | ✅ | 100% (v1 scope) | High | Substring search only, no semantic code search |
| Repository Intelligence (external) | ✅ | 100% | High | Real GitHub API, cached |
| Technology Radar | ✅ | 100% | Medium | Classification quality depends on signal volume |
| Knowledge Graph (data model + population + visualization) | ✅ | 95% | High | Real, auto-populated, and now visualized in a dashboard Graph tab (force layout, colored/filterable by kind, click to highlight connections); still no `repository` nodes from external Repository Intelligence |
| Innovation Intelligence (discovery, scoring, digest) | ✅ | 100% | High | Only GitHub collector proven live in this sandbox; HN/Reddit/arXiv are real but unverified live here |
| Verification Gate | ✅ | 100% | High | On by default, tested (pass + fail paths, live-verified) |
| Multi-Agent Specialist Roles | ✅ | 90% | High | 9 of 11 named roles exist or have a direct equivalent — Reviewer, Security Auditor, DevOps, UI Designer, Architect now shipped as real `BaseAgent` subclasses; only Documentation Writer and Video Creator remain missing |

## "AI Second Brain" Vision Layer

| Feature | Status | Completion | Quality | Notes |
|---|---|---|---|---|
| Universal Inbox (capture + classify + summarize) | 🟡 | 75% | High | Real capture/classify/store/archive; classification is regex, not AI; AI summarization now real, grounded in fetched page text via `WebFetchTool` for URLs; still no voice/image/document support |
| Memory Timeline | ✅ | 90% | Medium | Dashboard-only merge view; no per-record version history |
| Today's Focus widget | ✅ | 100% (for its scope) | High | Real composition of 3 live endpoints, polls every 15s |
| Idea Lab | 🟡 | 60% | High | Storage/scoring/dedup/lifecycle all real; "AI evaluation"/"market analysis" are deterministic heuristic formulas, not LLM reasoning; no related-projects link |
| Reflection Agent | ✅ | 90% | High | Real daily/weekly/monthly narrative with graceful offline fallback |
| Cross-store Hybrid Search | 🟡 | 70% | High | Real merge across Memory/Graph/Inbox; semantic mode is Memory-only, Graph/Inbox always keyword-only |
| Knowledge Vault | 🔴 | 0% | — | No code anywhere — pages, tags-as-taxonomy, backlinks, flashcards, revision history all absent |
| Project Workspace | 🔴 | 5% | — | Only a bare `project` Knowledge Graph node exists; no Project/Milestone/Task/Risk entities, no CRUD, no UI |
| Learning Hub | 🔴 | 0% | — | No code anywhere — courses, flashcards, quizzes, learning paths all absent |
| AI recommendations (dashboard-wide) | 🔴 | 0% | — | No recommendation engine exists in any subsystem |
| AI documentation generation | 🔴 | 0% | — | No agent/capability produces documentation |
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
| Real database (vs. JSON files) | 🔴 | See `implementation-status.md` Section 15 |

**Rollup:** 21 ✅/mostly-complete rows, 7 🟡 partial rows, 10 🔴 not-started
rows across 38 tracked features.
