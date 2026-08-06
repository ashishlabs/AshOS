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
covers what's actually implemented today: event normalization/dedup, six
real (opt-in) collectors — GitHub, Hacker News, Reddit, arXiv, Hugging
Face, and Product Hunt — a daily Markdown news digest built from them,
Repository Intelligence, and a Technology Radar, all built as extensions
of the pipeline below rather than a parallel system.
`docs/ashos-intelligence.md` covers the full 20-part architecture and the
roadmap for the rest of it.

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
ash innovation collectors          # list registered collectors, one per domain (+ opt-in live ones)
ash innovation discover            # run one discovery cycle across all domains (offline, mock)
ash innovation discover --live     # real discovery across every live collector instead
ash innovation digest               # run every live collector and save today's news as a Markdown file
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

Six real collectors ship today, all under `innovation/collectors/`, all
following the exact same shape:

| Collector (`id`) | Domain | Source | Signal `kind` |
|---|---|---|---|
| `github-releases-collector.ts` (`github-live`) | `github` | GitHub public Search API, per topic | `repository` |
| `hn-collector.ts` (`hn-live`) | `community` | Hacker News (Algolia Search API), per query | `discussion` |
| `reddit-collector.ts` (`reddit-live`) | `community` | Reddit public JSON listings, per subreddit | `discussion` |
| `arxiv-collector.ts` (`arxiv-live`) | `research` | arXiv Atom API, per category | `paper` |
| `huggingface-collector.ts` (`huggingface-live`) | `research` | Hugging Face models API, trending | `model-release` |
| `product-hunt-collector.ts` (`product-hunt-live`) | `market` | Product Hunt public RSS feed, per category | `product-launch` |

Product Hunt's official API (GraphQL v2) requires an authenticated
developer token, which this codebase doesn't ask a user for — the RSS
feed (`producthunt.com/feed?category=...`) is the one genuinely public,
unauthenticated surface, parsed with the same small hand-rolled
`<item>`-block regex extractor `arxiv-collector.ts` uses for Atom, rather
than an XML dependency.

Every one of them is deliberately **not** registered on the shared
`CollectorRegistry` that `IntelligenceAgent`s sweep automatically — doing so
would make every default `ash innovation discover` call hit the real
network, breaking the offline-by-default guarantee the rest of AshOS
relies on. Instead they're exposed as `InnovationModule.liveCollectors`
(an array) and only run through the explicit `runLiveDiscovery(sourceIds?)`
method (`ash innovation discover --live`, `ash innovation digest`, or
`POST /innovation/discover` with `{ live: true }`) — same
normalize/graph/profile/opportunity pipeline as every other collector,
just opt-in. This is the "offline by default, real via explicit opt-in"
convention the rest of AshOS follows (see `CLAUDE.md`). `runLiveDiscovery`
isolates each collector in its own try/catch, so one source being
rate-limited or network-blocked never stops the others from being
ingested — `ash innovation collectors` lists all six with an "(opt-in via
--live)" annotation, and `liveGithubCollector` remains as a deprecated
backward-compatible getter over `liveCollectors`.

**A note on this environment specifically**: only `api.github.com` is
allowlisted by this sandbox's network policy — Hacker News, Reddit, arXiv,
Hugging Face, and `producthunt.com` are all blocked here (verified for
Product Hunt via a direct `curl` returning a `403 CONNECT tunnel failed`
from the proxy, same signature as the other four), so in *this*
environment only `github-live` actually returns data; the other five
return zero signals gracefully (not an error — see `runLiveDiscovery`'s
per-collector isolation) rather than crashing. All six are fully
unit-tested with mocked `fetch` and will work as soon as AshOS runs
somewhere with normal outbound internet access.

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

## Idea Agent — promoting a captured idea into an Opportunity

`IdeaAgent` (`innovation/agents/idea-agent.ts`, capability `idea`) is the
Second Brain roadmap's "Idea Lab" (`docs/second-brain-roadmap.md` Tier 2
item 4): it takes a Universal Inbox item (`docs/inbox.md`) — or any raw
text — and runs it through the *exact same* pipeline a discovery cycle
runs collector signals through: turn it into a `Signal`, dedupe/normalize
via `EventStore`, record it in the namespaced Knowledge Graph, reinforce
the Builder Profile, then merge/score it via `OpportunityEngine`/
`ScoringEngine`. There is no second scoring concept — an idea you typed
and a signal a collector found are both just `Signal`s from here on, so
"detect duplicate ideas" and "combine related ideas" are the same
tag-overlap merge logic `OpportunityEngine` already has, not new code.

Like `TechnologyRadarAgent`/`RepositoryAnalystAgent`, `IdeaAgent`
constructs its own file-backed collaborators from `context.cwd` on every
run rather than depending on `InnovationModule`'s already-constructed
instances (`AgentContext` carries no reference to it) — so
`mergeThreshold` defaults to the same constant `kernel/config.ts` does
(`0.5`) unless a caller passes the real configured value explicitly. Both
the CLI and REST API do: `ashos.kernel.config.innovation.mergeThreshold`.

```bash
ash innovation idea capture "A tool that turns meeting notes into action items"
ash innovation idea capture --inbox <inbox-item-id>   # promote an existing Inbox item
```

Or `POST /innovation/ideas` with `{ inboxId? , content?, tags?, domain? }`
(one of `inboxId`/`content` required). Promoting an Inbox item marks it
`reviewed` (`InboxManager.updateStatus`) and links the resulting
`Signal.source` back to it (`inbox:<id>`), so the Opportunity's evidence
trail always points at where the idea came from. The dashboard's Inbox
tab has a "Promote to Idea" (lightbulb) button per item that calls this
same endpoint and shows the resulting opportunity's title and score
inline once promoted.

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

## Daily AI News Digest

`ash innovation digest` (`POST /innovation/digest`) is a different kind of
report from the Daily Brief above: instead of an LLM narrative over merged
opportunities, it's a deterministic, source-by-source **fact sheet** — the
closest thing to literally "today's AI news" AshOS produces. It calls
`InnovationModule.generateDigest()`, which:

1. Runs `runLiveDiscovery()` across every (or a selected subset of)
   `liveCollectors` — the same real GitHub/HN/Reddit/arXiv/Hugging
   Face/Product Hunt sources described above — ingesting every signal
   through the normal
   pipeline (events, graph, profile, opportunities) exactly like any other
   discovery cycle.
2. Passes the raw per-source results to `buildMarkdownDigest()`
   (`innovation/brief/markdown-digest.ts`, a pure function, fully unit
   tested) which renders one Markdown section per source — headline +
   link + summary for every captured item, an honest "No new items in
   this run" line for a source that had nothing today, and a `⚠️
   Unavailable this run: <reason>` line for a source that genuinely
   errored — plus a closing "Notable opportunities so far" section.
3. Saves the result to `.ashos/innovation/digests/<YYYY-MM-DD>.md` and
   returns both the Markdown string and the file path, so the CLI can
   print it and the API can hand it back directly.

```bash
ash innovation digest                    # every live collector
ash innovation digest --sources github-live,hn-live   # just a subset
```

Because it's built from real signals rather than an abstraction over them,
this is the command to actually run daily if what you want is a literal
news digest rather than a ranked opportunity narrative — the two reports
are complementary, not competing: run `ash innovation digest` for "what
happened," `ash innovation brief` for "what's worth building because of
it." See `docs/ashos-intelligence.md` §7/§17 for how this fits the larger
event-flow and daily-research-workflow design.

## Configuration

```json
// .ashos/config.json
{
  "innovation": {
    "researchProvider": "lmstudio",
    "researchModel": "qwen/qwen2.5-coder-14b",
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
"run discovery cycle" action and a "run live discovery (all sources)"
action, knowledge-base counters (opportunities, knowledge nodes,
relationships, categories tracked), the Builder Profile as weighted bars,
the top-scoring opportunities with their lifecycle stage and tags, the
registered collectors, a **Technology Radar** card (ring + evidence per
technology, with a refresh action), a **Repository Intelligence** card
(analyze any `owner/repo` by name, see cached profiles), a **Recent
events** card (the canonical, deduplicated event layer), and an on-demand
Daily Innovation Brief. All of it reads from the REST endpoints below,
polling every few seconds. The Markdown news digest (`ash innovation
digest` / `POST /innovation/digest`) is CLI/API-only today — it produces a
file rather than an in-page view, so it isn't yet surfaced as its own
dashboard card (roadmap item).

## REST API

See `docs/api.md` for the full table. Summary: `POST /innovation/discover`
(`{ domains?, live? }`, fire-and-forget, 202/409), `GET
/innovation/status`, `GET /innovation/opportunities[/:id]`, `GET
/innovation/brief`, `GET /innovation/profile`, `GET /innovation/collectors`,
`GET /innovation/live-collectors`, `POST /innovation/digest`, `GET
/innovation/graph`, `GET /innovation/events[/:id]`, `GET
/innovation/repositories[/:owner/:repo]`, `POST
/innovation/repositories/analyze`, `GET /innovation/radar`, `POST
/innovation/radar/refresh`, `POST /innovation/ideas`, `GET`/`PATCH
/innovation/config`.

## CLI

See `docs/cli.md`. Summary: `ash innovation discover [--live]|digest
[--sources]|list|show <id>|brief|profile|collectors|events|repo analyze
<o/r>|repo list|radar [--refresh]|idea capture [content] [--inbox
<id>] [--tags] [--domain]`.

## What's not implemented (see `docs/roadmap.md` and `docs/ashos-intelligence.md`)

- **Most domains are still mock-only.** Six real, opt-in collectors ship
  today (GitHub, Hacker News, Reddit, arXiv, Hugging Face, Product Hunt —
  see "Collectors" above — Product Hunt notably now closes the market
  domain's one named real source), but workflow and competitor domains —
  plus other real sources named in the AshOS Intelligence spec (Papers
  With Code, package registries, YouTube, X, company blogs) — still ship
  only deterministic mocks. This environment's network sandbox only
  allowlists `api.github.com` today, so only `github-live` actually
  returns data here; the other five are real, tested code waiting on an
  unrestricted environment to prove themselves live. Each follows the same `Collector`
  interface, so adding the rest is the same pattern again.
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
