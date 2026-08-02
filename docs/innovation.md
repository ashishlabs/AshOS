# Innovation Intelligence

Innovation Intelligence is AshOS's opportunity-discovery subsystem: instead
of only executing work you hand it, it continuously turns raw signals
("a GitHub issue", "a Reddit complaint", "a funding round", "a new
open-weight model") into a connected knowledge graph, merges related
signals into ranked, scored **Opportunities**, learns which categories of
product you tend to build, and can produce a Daily Innovation Brief
summarizing what's most worth building next.

This is also the foundation of **AshOS Intelligence** — the broader
"continuously monitor the AI ecosystem and decide what's worth building
next" capability described in `docs/ashos-intelligence.md`. This document
covers what's actually implemented today: event normalization/dedup,
a real (opt-in) GitHub collector, Repository Intelligence, and a
Technology Radar, all built as extensions of the pipeline below rather
than a parallel system. `docs/ashos-intelligence.md` covers the full
20-part architecture and the roadmap for the rest of it.

It follows the same architectural pattern as the rest of AshOS: everything
is a registry (`CollectorRegistry`), everything is provider-agnostic (the
"research provider" used for narrative synthesis is just another entry in
`ProviderRegistry`), everything is offline-by-default (deterministic mock
collectors, same role `MockProvider` plays for chat), and nothing runs
unless you explicitly ask it to (`ash innovation discover`,
`POST /innovation/discover`, or a scheduled job) — no auto-start-on-boot
behavior.

## Quick start

```bash
ash innovation collectors          # list registered collectors, one per domain
ash innovation discover            # run one discovery cycle across all domains (offline, mock)
ash innovation discover --live     # real GitHub Search API discovery instead
ash innovation list                # see ranked opportunities
ash innovation show <id>           # full detail: score, evidence, history
ash innovation brief               # today's Daily Innovation Brief
ash innovation profile             # what the learned Builder Profile favors
ash innovation events              # canonical, deduplicated events
ash innovation repo analyze <o/r>  # structured Repository Intelligence for one repo (real API)
ash innovation repo list           # every previously analyzed repository
ash innovation radar --refresh     # recompute + show the Technology Radar
```

Or the REST API (`docs/api.md`'s `/innovation/*` table).

## Pipeline

```
Collectors (one per domain, mock by default; real GitHub collector opt-in)
        │
IntelligenceAgent.run()  — collect signals, emit innovation:signal-captured
        │
EventStore.upsert()  — normalize into a canonical IntelligenceEvent,
                        dedup by category + Jaccard title/tag similarity
        │
KnowledgeGraph  — problem + tag nodes, connected by "relates-to" edges
        │
BuilderProfileStore  — every observed tag nudges its weight up
        │
OpportunityEngine  — merge into an existing Opportunity (tag-overlap
                      similarity ≥ mergeThreshold) or create a new one
        │
ScoringEngine  — recompute the 15-dimension OpportunityScore
        │
OpportunityStore  — persist (.ashos/innovation/opportunities/<id>.json)
        │
DailyBriefGenerator  — rank + narrate, on demand
```

Implemented as `InnovationModule.runDiscoveryCycle()` /
`runLiveGithubDiscovery()` (`innovation/innovation-module.ts`), which both
delegate every signal to the same private `ingestSignal()` stage so the
two paths can never drift apart. Each stage is an injected collaborator —
the functions themselves are orchestration only.

## Domains and Intelligence Agents

Six domains from the design spec, each with one `IntelligenceAgent`
(`innovation/agents/intelligence-agent.ts`) sharing a single implementation
— they only differ in which domain's `Collector`s they run, which are data,
not classes:

| Domain | Agent capability | Watches for |
|---|---|---|
| `market` | `intelligence:market` | Startups, SaaS launches, funding, acquisitions, emerging categories |
| `github` | `intelligence:github` | Trending/fast-growing repos, issues, feature requests, ecosystem gaps |
| `community` | `intelligence:community` | Reddit/HN/Dev.to/Stack Overflow complaints, repeated questions, missing tooling |
| `research` | `intelligence:research` | arXiv/Hugging Face, model releases, benchmark improvements |
| `workflow` | `intelligence:workflow` | Manual, repetitive, automatable work across professions |
| `competitor` | `intelligence:competitor` | Pricing/feature/review/roadmap changes, market gaps |

Every `IntelligenceAgent` is registered onto the **same** `AgentRegistry`
AshOS already uses for Code/Research/Git/Testing/Generic — they're
routable by capability like any other agent (e.g. the Planner could target
`intelligence:github` directly), not a separate, siloed registry.

## Collectors — offline by default, pluggable for real sources

A `Collector` (`innovation/collectors/types.ts`) is one domain's signal
source: `{ id, domain, description, collect(): Promise<Signal[]> }`.
`createMockCollector` (`innovation/collectors/mock-collector.ts`) is the
default for every domain — deterministic, offline, seeded with a handful of
illustrative signals per domain, the same role `MockProvider` plays for
chat (so `ash init && ash innovation discover` works with zero network
access or API keys, and the whole test suite runs offline).

**Adding a real collector** (GitHub search API, Hacker News/Reddit JSON
endpoints, arXiv API, ...) is implementing the same `Collector` interface
and registering it under a different id via `CollectorRegistry.register` —
either built-in (`InnovationModule`) or via a plugin
(`host.innovation.collectors`, `kernel/types.ts`'s `PluginHost`). No engine
code changes needed.

One real collector ships today: `innovation/collectors/github-releases-collector.ts`
(`id: "github-live"`, `domain: "github"`) queries GitHub's public Search
API per topic (`ai`, `artificial-intelligence`, `llm`, `ai-agents`,
`developer-tools` by default) for repositories pushed recently, converting
each into a `repository` signal with confidence scaled by star count. It is
deliberately **not** registered on the shared `CollectorRegistry` that
`IntelligenceAgent`s sweep automatically — doing so would make every
default `ash innovation discover` call hit the real network, breaking the
offline-by-default guarantee the rest of AshOS relies on. Instead it's
exposed as `InnovationModule.liveGithubCollector` and only runs through the
explicit `runLiveGithubDiscovery()` method (`ash innovation discover --live`
or `POST /innovation/discover` with `{ live: true }`) — same
normalize/graph/profile/opportunity pipeline as every other collector,
just opt-in. This is the "offline by default, real via explicit opt-in"
convention the rest of AshOS follows (see `CLAUDE.md`).

Every other domain still ships only a mock collector — see "What's not
implemented" below.

## Event Normalization & Deduplication

Raw `Signal`s from different collectors can describe the same real-world
change — the same model release mentioned by two collectors, or a
near-duplicate repository signal on a re-run. `innovation/events/` is the
canonical layer that sits between raw signals and `Opportunity`s:

- `EVENT_CATEGORIES` (`innovation/events/types.ts`) is a small, closed
  taxonomy — `model-release`, `repository`, `framework`, `benchmark`,
  `research-paper`, `startup`, `funding`, `acquisition`, `api-change`,
  `pricing-update`, `security-issue`, `breaking-change`, `dataset`,
  `developer-tool`, `library-update` — deliberately not the same as
  `SignalKind` (which is collector-facing and keeps growing), so downstream
  consumers (the Technology Radar, reports, dashboard filters) have a
  stable vocabulary.
- `categorize(signal)` (`innovation/events/normalizer.ts`) maps a signal's
  `kind` (with tag overrides) into one `EventCategory`.
- `similarity(a, b)` is Jaccard similarity over title tokens ∪ tags;
  `findDuplicate()` looks for the best same-category match above
  `DEDUP_THRESHOLD` (0.5).
- `EventStore.upsert(signal)` (`innovation/events/event-store.ts`) either
  merges the signal into the matching `IntelligenceEvent` (bumping
  `occurrences`, appending to `sources`, recombining confidence via
  `1 - Π(1 - cᵢ)` so corroborating sources raise confidence rather than
  averaging it down) or creates a new one. Persisted as
  `.ashos/innovation/events/<id>.json`, same one-JSON-file-per-record
  pattern as `OpportunityStore`.

Every signal is normalized this way *before* it reaches the knowledge
graph and opportunity engine — `ash innovation events` / `GET
/innovation/events` show this deduplicated layer directly, independent of
how many opportunities it eventually feeds.

## Unified Knowledge Graph

`KnowledgeGraph` (`innovation/graph/knowledge-graph.ts`) is a single JSON
file (`.ashos/innovation/graph.json`), the same local-first, no-external-DB
pattern `MemoryManager`/`ExperimentStore` already use. Every signal records
a `problem` node (its title) connected via `relates-to` edges to one
`technology` node per tag; nodes are de-duplicated by `(kind, label)` so
repeated observations of the same problem/technology strengthen an edge's
weight instead of cloning the node. `KnowledgeNodeKind` covers the full
entity list from the design doc (person, company, repository, product,
idea, problem, industry, technology, community, language, framework,
market, startup, paper, workflow, agent, project, skill, tool) — only
`problem`/`technology` are populated by the built-in discovery cycle today;
richer entity extraction (companies, people, repos as first-class nodes) is
a natural extension once a real collector supplies that structure.

## Opportunity Engine — the heart of the system

`OpportunityEngine` (`innovation/opportunity/opportunity-engine.ts`) decides,
for every new signal, whether it strengthens an existing `Opportunity` or
seeds a new one. Similarity is Jaccard tag-overlap — deliberately not an
LLM call, so merging is fast, deterministic, explainable, and cheap to run
every cycle; `innovation.mergeThreshold` (config, default `0.5`) is the one
knob to retune. An `Opportunity` is evidence-complete: it carries every
merged `Signal` directly (`opportunity.signals`), not just IDs into a
separate store, so a `Builder Workspace` view never needs a second lookup.

## Opportunity Score (15 dimensions)

`ScoringEngine` (`innovation/opportunity/scoring.ts`) is pure,
dependency-free heuristic logic, so it's cheap to unit test and retune
without touching the engine that calls it. All 15
dimensions from the design doc are computed from the opportunity's
signals (count, confidence, domain mix, signal kind) plus the Builder
Profile (for `strategicAlignment`/`personalFit`):

`marketDemand`, `competition`, `revenuePotential`, `automationPotential`,
`aiAdvantage`, `technicalDifficulty`, `buildTime`, `distributionPotential`,
`openSourcePotential`, `virality`, `communityInterest`,
`strategicAlignment`, `personalFit`, `futureGrowth`, `confidence`.

`competition`, `technicalDifficulty` and `buildTime` are cost-like (lower
raw value is better) and are inverted before folding into `overall` — a
weighted average, weights configurable via `OpportunityScoreWeights`
(equal by default). Scores are recomputed from scratch on every merge, so
they continuously update as new evidence arrives, per the design doc.

## Idea Lifecycle

`innovation/lifecycle.ts` is a pure state machine over the stages from the
design doc: `captured -> validated -> growing -> researching -> planning ->
building -> testing -> released`, with `archived`/`revived` reachable from
(almost) any stage as an escape hatch. `transition(opportunity, to)`
validates against `LIFECYCLE_TRANSITIONS` and throws on an invalid jump,
appending a timestamped entry to `opportunity.history` on success.

## Repository Intelligence

`RepositoryAnalystAgent` (`innovation/agents/repository-analyst-agent.ts`,
capability `repository-analyst`) turns one GitHub repository into a
structured, cached `RepositoryProfile`
(`innovation/repository/types.ts`): primary language, per-language byte
breakdown, topics, license, stars/forks/issues/watchers, contributor count,
best-effort `package.json` dependencies, and four deterministic 0-1
heuristics — `maintenanceStatus` (active/maintained/stale/abandoned, from
`pushedAt` recency), `innovationScore`, `productionReadiness`,
`adoptionPotential` — plus a plain-English `ashosCompatibility` note. None
of this is an LLM judgment call; it's transparent arithmetic over real
GitHub API fields, documented inline in the agent.

**Caching**: analyzing a repository always makes one cheap `GET
/repos/{fullName}` call first and compares its `pushed_at` against the
cached profile. If nothing changed, it returns the cache without paying for
the expensive calls (`/languages`, `/contributors` pagination count,
`/contents/package.json`) — "never repeat expensive analysis unless
something changed." Run it via `ash innovation repo analyze
"owner/repo"` / `POST /innovation/repositories/analyze`; list everything
already analyzed via `ash innovation repo list` / `GET
/innovation/repositories`. This is a real, network-backed agent (like
`github-trending`), not gated behind a mock — there's nothing to fake here
since it's a one-shot, on-demand lookup rather than a recurring discovery
sweep.

## Technology Radar

`TechnologyRadarAgent` (`innovation/agents/technology-radar-agent.ts`,
capability `technology-radar`) classifies every `technology` node already
in the `KnowledgeGraph` into one of five rings — `emerging`, `growing`,
`stable`, `declining`, `obsolete` — using a deterministic,
evidence-based heuristic (`innovation/radar/classify.ts`), not an LLM:

1. `obsolete` — unseen for more than 180 days
2. `declining` — unseen for 60-180 days
3. `emerging` — first seen within the last 30 days AND mentioned more than once
4. `growing` — averaging at least 0.5 mentions/day
5. `stable` — the default otherwise

Evidence (`totalMentions`, `daysSinceFirstSeen`, `daysSinceLastSeen`,
`mentionsPerDay`) is stored alongside every classification so the ring
assignment is always explainable, not a black box. `totalMentions` sums the
edge weights of every relationship touching that technology node in the
graph — the more signals/events reference it, the stronger the evidence.
Run via `ash innovation radar --refresh` / `POST
/innovation/radar/refresh`; read the current snapshot via `ash innovation
radar` / `GET /innovation/radar?ring=`. Persisted as a single
`.ashos/innovation/radar.json` snapshot (whole-radar replace on refresh,
same pattern as `KnowledgeGraph`'s single-file store).

## Personal Builder Profile — the Learning Loop

`BuilderProfileStore` (`innovation/profile/builder-profile-store.ts`) is a
single JSON file (`.ashos/innovation/builder-profile.json`) tracking a
per-tag weight: `recordSignal(tags)` nudges every observed tag up slightly
just from being seen; `reinforce(tags, "positive" | "negative")` is the
Learning Loop's hook for outcomes — was an opportunity actually built and
useful, or ignored/rejected? Positive outcomes reinforce more strongly than
passive observation; negative outcomes can pull a tag's weight down
(never below 0), so future `strategicAlignment`/`personalFit` scoring
shifts away from patterns the user keeps rejecting. Nothing calls
`reinforce()` automatically yet — see "What's not implemented" below.

## Daily Innovation Brief

`DailyBriefGenerator` (`innovation/brief/daily-brief.ts`) ranks
opportunities by `score.overall` (deterministic, no LLM required — `ash
innovation brief` always works offline) and asks the configured research
provider for a short narrative paragraph, same "never hard-fail" pattern as
`Researcher`/`Planner`: an unreachable provider falls back to a plain,
still-useful one-line summary instead of erroring.

## Configuration

```json
// .ashos/config.json
{
  "innovation": {
    "researchProvider": "lmstudio",
    "researchModel": "google/gemma-4-12b-qat",
    "domains": ["market", "github", "community", "research", "workflow", "competitor"],
    "mergeThreshold": 0.5,
    "briefSize": 5
  }
}
```

`researchProvider` is resolved through the same `ProviderRegistry` as
everything else — Claude/OpenAI/Ollama/local models all work with zero
changes to any innovation/* code.

## Dashboard

The **Innovation** tab (`dashboard/src/App.tsx`) shows: research
provider/model and monitored domains, live running/idle status with both a
"run discovery cycle" action and a "run live GitHub discovery" action,
knowledge-base counters (opportunities, knowledge nodes, relationships,
categories tracked), the Builder Profile as weighted bars, the top-scoring
opportunities with their lifecycle stage and tags, the registered
collectors, a **Technology Radar** card (ring + evidence per technology,
with a refresh action), a **Repository Intelligence** card (analyze any
`owner/repo` by name, see cached profiles), a **Recent events** card (the
canonical, deduplicated event layer), and an on-demand Daily Innovation
Brief. All of it reads from the REST endpoints below, polling every few
seconds.

## REST API

See `docs/api.md` for the full table. Summary: `POST /innovation/discover`
(`{ domains?, live? }`, fire-and-forget, 202/409), `GET
/innovation/status`, `GET /innovation/opportunities[/:id]`, `GET
/innovation/brief`, `GET /innovation/profile`, `GET /innovation/collectors`,
`GET /innovation/graph`, `GET /innovation/events[/:id]`, `GET
/innovation/repositories[/:owner/:repo]`, `POST
/innovation/repositories/analyze`, `GET /innovation/radar`, `POST
/innovation/radar/refresh`, `GET`/`PATCH /innovation/config`.

## CLI

See `docs/cli.md`. Summary: `ash innovation discover [--live]|list|show
<id>|brief|profile|collectors|events|repo analyze <o/r>|repo list|radar
[--refresh]`.

## What's not implemented (see `docs/roadmap.md` and `docs/ashos-intelligence.md`)

- **Most collectors are still mock-only.** Only GitHub has a real,
  opt-in collector (`github-releases-collector.ts`). Market, community,
  research, workflow, and competitor domains — plus other real sources
  named in the AshOS Intelligence spec (HuggingFace, arXiv, Papers With
  Code, Hacker News, Reddit, package registries, YouTube, X) — still ship
  only deterministic mocks; this environment's network sandbox only
  allowlists `api.github.com` today, which is why GitHub was the first
  real slice. Each follows the same `Collector` interface.
- **Specialized research agents beyond Repository Analyst and Technology
  Radar aren't built yet** — Research Paper Analyst, Startup Analyst,
  Benchmark Analyst, Documentation Analyst, API Change Analyst, Security
  Analyst, Trend Analyst, Opportunity Analyst. See
  `docs/ashos-intelligence.md` for their designed responsibilities.
- **The Learning Loop's `reinforce()` has no automatic caller.** Nothing
  currently observes "was this opportunity actually built" and calls
  `BuilderProfileStore.reinforce()` — that requires the execution-
  integration step below.
- **No automatic project scaffolding.** The design doc's "when an
  opportunity is accepted, automatically create a Project/Tasks/
  Milestones/..." step isn't wired up; today `ash innovation show <id>`
  gives you the evidence and score to plan that manually (or hand it to
  `ashos.plan()`).
- **No Weekly/Monthly reports** — only the Daily Brief is implemented; a
  weekly/monthly rollup would reuse the same `DailyBriefGenerator`-style
  pattern over a longer window, likely folding in Technology Radar
  ring transitions and repository-profile deltas.
- **Richer knowledge-graph entity extraction** (companies, people,
  repositories as first-class nodes, not just problem/technology) needs a
  real collector supplying that structure — the graph API already supports
  arbitrary `KnowledgeNodeKind`s.
- **No Project Matcher / Recommendation Engine yet** — matching
  opportunities and technology-radar movements against the user's actual
  projects (as opposed to just the Builder Profile's tag weights) is
  designed in `docs/ashos-intelligence.md` but not implemented.
