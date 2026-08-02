# AshOS Roadmap v2 — North Star Gap Analysis

This document captures the user-defined "North Star" vision for AshOS (15
goals, 5 version milestones) and maps each goal against what's *actually*
implemented in this codebase today, then lays out a prioritized, staged
feature plan to close the gaps. It's a planning document, not an
architecture spec — see `docs/architecture.md` for how the system fits
together and `docs/ashos-intelligence.md` for the Innovation/Intelligence
subsystem's own detailed design.

## North Star Vision

> AshOS is an open-source AI Operating System that behaves like a skilled
> digital employee. It understands long-term goals, remembers context
> across projects, coordinates specialized agents, executes work using
> local and cloud intelligence, continuously learns from experience, and
> helps individuals and teams turn ideas into finished products with
> minimal manual intervention.

## Version milestones (user-defined) vs. actual state

| Stage | Goal | Actual completeness |
|---|---|---|
| v1 | AI workspace with chat, tools, memory, and local/cloud models | **~100%** — already shipped |
| v2 | Multi-agent orchestration and persistent repository intelligence | **~85%** — orchestration ✅, local repo intelligence ✅ (`codebase/`, Stage 1, shipped) alongside the existing external-repo analysis |
| v3 | Autonomous research, planning, and execution of complex projects | **~50%** — planning/execution ✅, general-purpose research ❌ (only AI-ecosystem-scoped) |
| v4 | Continuous learning, innovation discovery, and self-optimization | **~30%** — innovation discovery ✅ (fully shipped), learning/self-optimization ❌ |
| v5 | A true AI OS managing dev, knowledge, automation, and creative production end-to-end | **~10%** — automation infra ✅, creative production ❌, full autonomy loop ❌ |

## Goal-by-goal gap analysis

| # | Goal | State | Notes |
|---|---|---|---|
| 1 | Become an AI Employee | 🟡 Partial | `Planner`→`TaskExecutor`→`AgentRegistry` already understands objectives, breaks into tasks, and assigns specialized agents by capability. Missing: a verification gate after execution, and any "improve over time" feedback loop. |
| 2 | Unified AI Workspace | 🟡 Partial | Local (Ollama/LM Studio) + cloud (Anthropic/OpenAI) providers, plus shell/git/fs tools, all exist. Missing: MCP client, Docker tool, browser automation — all three already named "deferred" in `docs/roadmap.md`. |
| 3 | Persistent Memory | 🟡 Partial | `MemoryManager` (4 scopes + semantic vector search) is a solid substrate, but nothing auto-writes decisions/failures/successes — everything must be told to remember explicitly. |
| 4 | Repository Intelligence | ✅ Done | `RepositoryAnalystAgent` analyzes **external** GitHub repos (stars, license, deps) for Innovation Intelligence. `codebase/`'s `CodebaseAnalystAgent` (Stage 1, shipped) now covers the other half: deep-indexing the **local working repository** — file tree, modules, symbols, git-commit-cached — so an agent can answer "where does feature X live" without re-scanning. See `docs/codebase-intelligence.md`. |
| 5 | Multi-Agent Collaboration | 🟡 Partial | 14 agents registered today (Generic/Code/Research/Git/Testing/GitHubTrending + 8 Innovation agents). Missing named roles: Reviewer, Security Auditor, DevOps, UI Designer, Architect, Video Creator. |
| 6 | Local-First AI | 🟡 Partial | Local providers exist, but nothing automatically *prefers* them — there's no router that defaults routine work to cheap/local models and escalates only when needed. |
| 7 | Innovation Engine | ✅ Done | GitHub/HN/Reddit/arXiv/Hugging Face collectors, event dedup, knowledge graph, opportunity scoring, Daily Brief, and a Markdown news digest are all shipped. Only Product Hunt (explicitly named) is missing, same collector pattern as the rest. |
| 8 | Autonomous Research | 🟡 Partial | `ResearchAgent` exists but has no web search/fetch tool — it reasons from the model alone. The Innovation collectors prove the multi-source pattern works; it's just scoped to AI-ecosystem signals, not arbitrary topics. |
| 9 | Build Software End-to-End | 🟡 Partial | `ashos.run(goal)` already does research→plan→code→test→git for one pass. Design, deploy, monitor, and iterate are all missing. **Overlaps with the removed Evolution Engine** — see below. |
| 10 | Continuous Learning | ❌ Missing | `BuilderProfileStore` learns narrowly for Innovation category weights only; nothing learns from general task outcomes. **Overlaps with the removed Evolution Engine.** |
| 11 | Workflow Automation | ✅ Infra done | `WorkflowEngine` + `Scheduler` fully support this — "daily AI news" is literally the digest already built. Needs more workflow definitions + a couple of new tools (email, calendar) for the other named examples. |
| 12 | Knowledge Graph | 🟡 Partial | `KnowledgeGraph` (`innovation/graph/`) is already domain-agnostic — it has unused node kinds for `"project"`, `"agent"`, `"workflow"`, `"skill"`, `"tool"` sitting in the type today, never populated. It only tracks Innovation signals, not the user's own projects/tasks/decisions. |
| 13 | Creative Studio | ❌ Missing | Zero media generation. Text content (blog/docs) is achievable today with existing agents; images/video/voice need entirely new provider types. Least aligned with "local-first, free APIs" and the most commoditized space — **recommend deprioritizing**. |
| 14 | Self-Improving Platform | ❌ Missing | Nothing built. **Overlaps with the removed Evolution Engine.** |
| 15 | Personal Operating System | ❌ Missing | Calendar/finance/home-server pulls toward a different product than the rest of this list (general life-management app vs. developer-focused AI operating system). **Flagged as scope-creep risk**, not scheduled. |

## A decision that needs to be made explicitly: Evolution Engine

Goals **#9** ("iterate"), **#10** (learn from mistakes), and **#14**
(benchmark, optimize, self-improve) are, almost exactly, what the
**Evolution Engine** subsystem did before it was removed (commit
`8f7400b`, "Remove Evolution Engine") — a mutation engine, git worktree
execution pipeline, evaluator + experiment history, observer/researcher
hypothesis generation, and an orchestration loop. That removal predates
this North Star document. Three of fifteen goals now point squarely back
at that territory.

**This is not decided by this document.** Options, for the user to choose
between when Stage 2/3 work approaches that territory:
1. Rebuild a leaner version of Evolution Engine's concepts, purpose-built
   for these three goals rather than the original generic mutation-testing
   framing.
2. Treat goals #9 (iterate)/#10/#14 as aspirational for now and revisit
   once Stages 1-5 below are shipped.

## Staged feature plan

Ordered by leverage — how directly each closes multiple goals versus how
much new architecture it requires.

### Tier 1 — highest leverage, fits existing architecture, no new concepts

| Stage | Feature | Closes |
|---|---|---|
| 1 ✅ | **Local Codebase Intelligence** — index the actual working repository (file tree, module map, lightweight symbol extraction, "where does X live"), separate from the external-repo `RepositoryAnalystAgent`, cached and invalidated by git commit hash. **Shipped**: `codebase/` package, `CodebaseAnalystAgent`, `ash codebase index/find/list`, `/codebase/*`. See `docs/codebase-intelligence.md`. | #4, unlocks #1/#9 |
| 2 | **Model Router** — task-aware provider selection: cheap/local by default, escalate to frontier models only when a task needs it. | #6 |
| 3 | **Outcome Memory / Reflection hook** — after every agent task, auto-write `{goal, approach, outcome, error?}` into project memory via a `TaskExecutor`/`DagExecutor` hook. | #3 (failures/successes), feeds #10 |
| 4 | **General Knowledge Graph** — reuse the existing `KnowledgeGraph` class for a second instance tracking Projects/Files/Agents/Tasks/Decisions, using the node kinds that already exist in the type but are unpopulated. | #12 |
| 5 | **Verification gate** — make `TestingAgent`/a new `ReviewerAgent` a required DAG step after code-producing tasks, not just an available capability an LLM might route to. | #1 ("verify results") |

### Tier 2 — new agents/tools, moderate effort, no new architecture

6. Add Reviewer, Documentation Writer, Security Auditor, Architect agents — role prompts over existing tools, no new infrastructure. Closes most of #5.
7. `WebSearchTool`/`WebFetchTool` + generalize `ResearchAgent` to research any topic, not just AI-ecosystem signals. Closes #8.
8. MCP client support — one standardized integration point instead of hand-building Docker/browser/etc. one at a time. Biggest lever for #2.
9. Kanban view over the existing task graph (UI only, backend already exists).
10. Product Hunt collector (same pattern as the five collectors already shipped). Closes the last piece of #7.

### Tier 3 — needs an explicit decision before building

11. Evolution Engine revival (see decision above) — for #9/#10/#14.
12. Docker tool + a real deploy/monitor loop for #9 — genuine new infrastructure, worth scoping deliberately once reached.
13. Creative Studio (#13) — deprioritized; revisit only if the developer-agent core feels complete and there's a specific need.
14. Personal OS (#15) — scope-creep risk; treat as out of scope unless explicitly requested.

## Status

Tracked as tasks #56-#61 in this session (Stage 1-5 = Tier 1 items,
worked sequentially, each fully built/tested/documented/committed before
moving to the next). Tier 2/3 items are not yet scheduled as tasks — pick
up after Tier 1 lands.

- Stage 1 (Local Codebase Intelligence) — **shipped**.
- Stages 2-5 — pending.
