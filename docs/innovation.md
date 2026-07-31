# Innovation Intelligence

Innovation Intelligence is AshOS's opportunity-discovery subsystem: instead
of only executing work you hand it, it continuously turns raw signals
("a GitHub issue", "a Reddit complaint", "a funding round", "a new
open-weight model") into a connected knowledge graph, merges related
signals into ranked, scored **Opportunities**, learns which categories of
product you tend to build, and can produce a Daily Innovation Brief
summarizing what's most worth building next.

It follows the same architectural pattern as the Evolution Engine
(`docs/evolution.md`): everything is a registry (`CollectorRegistry`, same
shape as `MutationRegistry`/`BenchmarkRegistry`), everything is
provider-agnostic (the "research provider" used for narrative synthesis is
just another entry in `ProviderRegistry`), everything is offline-by-default
(deterministic mock collectors, same role `MockProvider` plays for chat),
and nothing runs unless you explicitly ask it to (`ash innovation discover`,
`POST /innovation/discover`, or a scheduled job) — no auto-start-on-boot
behavior.

## Quick start

```bash
ash innovation collectors          # list registered collectors, one per domain
ash innovation discover            # run one discovery cycle across all domains
ash innovation list                # see ranked opportunities
ash innovation show <id>           # full detail: score, evidence, history
ash innovation brief               # today's Daily Innovation Brief
ash innovation profile             # what the learned Builder Profile favors
```

Or the REST API (`docs/api.md`'s `/innovation/*` table).

## Pipeline

```
Collectors (one per domain, mock by default)
        │
IntelligenceAgent.run()  — collect signals, emit innovation:signal-captured
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

Implemented as `InnovationModule.runDiscoveryCycle()`
(`innovation/innovation-module.ts`), which mirrors
`EvolutionEngine.runExperiment()`'s "every stage is an injected
collaborator, orchestration only" shape.

## Domains and Intelligence Agents

Six domains from the design spec, each with one `IntelligenceAgent`
(`innovation/agents/intelligence-agent.ts`) sharing a single implementation
— they only differ in which domain's `Collector`s they run, the same way
`ash evolve`'s mutations/benchmarks are data, not classes:

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
(`host.innovation.collectors`, `kernel/types.ts`'s `PluginHost`, following
the exact extension path `evolution/plugins/evolution-extras` demonstrates
for mutations/benchmarks). No engine code changes needed. This repository
ships only the mock collectors — see "What's not implemented" below.

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
dependency-free heuristic logic — the same "Evaluator is pure logic"
convention as `evolution/evaluation/evaluator.ts` — so it's cheap to unit
test and retune without touching the engine that calls it. All 15
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

Exactly like the Evolution Engine's `researchProvider`, this is resolved
through the same `ProviderRegistry` as everything else — Claude/OpenAI/
Ollama/local models all work with zero changes to any innovation/* code.

## REST API

See `docs/api.md` for the full table. Summary: `POST /innovation/discover`
(fire-and-forget, 202/409), `GET /innovation/status`, `GET
/innovation/opportunities[/:id]`, `GET /innovation/brief`, `GET
/innovation/profile`, `GET /innovation/collectors`, `GET /innovation/graph`,
`GET`/`PATCH /innovation/config`.

## CLI

See `docs/cli.md`. Summary: `ash innovation discover|list|show
<id>|brief|profile|collectors`.

## What's not implemented (see `docs/roadmap.md`)

- **Only mock collectors ship built-in.** Real network-backed collectors
  (GitHub search API, Hacker News/Reddit JSON endpoints, arXiv API,
  Product Hunt, etc.) follow the exact same `Collector` interface and
  extension path as a new provider/tool/agent, but none are implemented
  here yet.
- **The Learning Loop's `reinforce()` has no automatic caller.** Nothing
  currently observes "was this opportunity actually built" and calls
  `BuilderProfileStore.reinforce()` — that requires the execution-
  integration step below.
- **No automatic project scaffolding.** The design doc's "when an
  opportunity is accepted, automatically create a Project/Tasks/
  Milestones/..." step isn't wired up; today `ash innovation show <id>`
  gives you the evidence and score to plan that manually (or hand it to
  `ashos.plan()`).
- **No Weekly Deep Research report** — only the Daily Brief is
  implemented; a weekly rollup would reuse the same
  `DailyBriefGenerator`-style pattern over a longer window.
- **No dashboard UI page** for Innovation Intelligence yet — the REST API
  is the current source of truth (same caveat as Evolution's dashboard tab
  being the only visual surface).
- **Richer knowledge-graph entity extraction** (companies, people,
  repositories as first-class nodes, not just problem/technology) needs a
  real collector supplying that structure — the graph API already supports
  arbitrary `KnowledgeNodeKind`s.
