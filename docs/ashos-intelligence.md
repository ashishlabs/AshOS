# AshOS Intelligence — Architecture

> **Status**: living design document + implementation roadmap for evolving
> AshOS from "a system that executes work you hand it" into a system that
> also **decides what work is worth doing**. This document describes the
> target architecture in full; sections are explicitly marked **[shipped]**
> where the current codebase already implements them, and **[roadmap]**
> where they are designed but not yet built. Nothing described here removes
> an existing AshOS capability — every piece is additive to the
> `innovation/` package documented in `docs/innovation.md`, following the
> same conventions as the rest of the system (offline-by-default,
> event-driven, provider-agnostic, plugin-extensible, JSON-file
> persistence, capability-routed agents).

## 1. Vision

AshOS today plans and executes goals you give it. AshOS Intelligence adds
a second, complementary loop: **continuously observe the AI/software
ecosystem, and turn what changes into decisions** — like an in-house CTO,
research analyst, technology scout, and innovation strategist rolled into
one, but transparent and explainable rather than a black box. It should be
able to answer, at any time:

- *What changed today, and why does it matter?*
- *Which of my projects/technologies are affected?*
- *What's becoming obsolete, and what's emerging to replace it?*
- *What's worth building next, and why?*

The goal is **intelligent decision-making, not information overload** — a
handful of well-evidenced, explainable conclusions beat a firehose of raw
signals. Every conclusion AshOS Intelligence reaches must be traceable back
to the evidence that produced it (a signal, a source URL, a graph edge, a
score component) — nothing is asserted without a "why."

## 2. Design goals

| Goal | How the architecture achieves it |
|---|---|
| Modular | Many small, single-purpose collaborators (collectors, normalizers, stores, scoring/classification functions) composed by thin orchestrators (`InnovationModule`), not one monolith. |
| Agent-driven | Specialized agents (one per domain, one per analysis type) routed by capability through the existing `AgentRegistry` — never a single do-everything agent. |
| Event-based | Every stage emits onto the existing process-wide `EventBus`; nothing polls for state it can subscribe to. |
| Memory-first | Every observation is persisted (events, graph, opportunities, repository profiles, radar) before it is reasoned about — nothing lives only in a request/response cycle. |
| Extensible | New sources, agents, and event categories are plugins/registrations, never engine edits — same contract collectors/tools/providers already use. |
| Explainable | Every score, classification, and merge decision is either a transparent deterministic heuristic or an LLM narrative *over* deterministic evidence — never an opaque LLM verdict standing alone. |
| Incremental | Built as a vertical slice at a time (this document's §21 milestones), each shippable and independently useful, not a big-bang rewrite. |
| Autonomous | Runs unattended on a schedule once configured, but never auto-starts without being asked (see `docs/innovation.md`'s offline-by-default convention). |
| Production-ready | Same patterns already hardened elsewhere in AshOS: typed interfaces, JSON persistence with atomic per-record files, permission gating for anything with side effects, full test coverage with no real-network dependency in CI. |

## 3. Relationship to existing AshOS — what's kept, what's added

**Nothing is removed.** AshOS Intelligence is built entirely as new
modules inside `innovation/` plus additive routes/commands in
`api/server.ts` and `cli/commands/innovation.ts`. The existing Innovation
Intelligence pipeline (`docs/innovation.md`) — collectors, the knowledge
graph, the opportunity engine, the builder profile, the daily brief — is
the foundation this builds on, not a subsystem it replaces:

```
Existing (Innovation Intelligence)         Added (AshOS Intelligence)
─────────────────────────────────         ──────────────────────────
Collector → Signal                         Signal → IntelligenceEvent
                                            (normalize + dedup)   [shipped]
IntelligenceAgent (per domain)             RepositoryAnalystAgent,
                                            TechnologyRadarAgent,
                                            + more analysts        [partial]
KnowledgeGraph (problem/technology)        richer entities + temporal
                                            reasoning               [roadmap]
OpportunityEngine (tag-overlap merge)      gap/underserved-market
                                            detection               [roadmap]
BuilderProfileStore                        Project Matcher,
                                            Recommendation Engine   [roadmap]
DailyBriefGenerator                        Weekly/Monthly reports  [roadmap]
```

## 4. High-level architecture

```
                              User / Schedule
                                    │
                    ┌───────────────┼────────────────┐
                    │               │                │
                CLI (ash)      Dashboard         Scheduler (cron)
                    │               │                │
                    └───────────────┼────────────────┘
                                    │
                             REST API (express)
                                    │
                          SDK facade (AshOS.innovation)
                                    │
 ┌──────────────────────────────────────────────────────────────────┐
 │                          InnovationModule                         │
 │  (orchestration only — every stage below is an injected           │
 │   collaborator; this class wires them together)                   │
 └──────────────────────────────────────────────────────────────────┘
        │              │              │              │           │
   Collectors      EventStore    KnowledgeGraph  OpportunityEngine  Specialized
   (per domain,    (normalize +  (problem/tech   (merge, score)     Agents
   mock + opt-in    dedup)        nodes, edges)                     (repo analyst,
   real GitHub)                                                     radar, + more)
        │              │              │              │           │
        └──────────────┴──────────────┴──────────────┴───────────┘
                                    │
                    JSON-file persistence under .ashos/innovation/
                    (events/, repositories/, radar.json, graph.json,
                     opportunities/, builder-profile.json)
                                    │
                    EventBus — every stage emits, Kernel mirrors to Logger
                                    │
              DailyBriefGenerator (+ roadmap: Weekly/Monthly reports)
```

## 5. Module hierarchy

```
innovation/
├── types.ts                       Signal, KnowledgeNode/Edge, Opportunity, DailyBrief [shipped]
├── innovation-module.ts           InnovationModule — the one orchestration class      [shipped]
├── lifecycle.ts                   Idea lifecycle state machine                        [shipped]
├── collectors/
│   ├── types.ts                   Collector interface                                [shipped]
│   ├── registry.ts                CollectorRegistry                                  [shipped]
│   ├── mock-collector.ts          Deterministic offline collector, one per domain     [shipped]
│   └── github-releases-collector.ts   Real GitHub Search API collector (opt-in)       [shipped]
│       (roadmap: hn-collector.ts, arxiv-collector.ts, huggingface-collector.ts,
│        reddit-collector.ts, package-registry-collector.ts, ... — same interface)
├── events/                        Event Normalization & Deduplication                 [shipped]
│   ├── types.ts                   EventCategory, IntelligenceEvent, EventSource
│   ├── normalizer.ts              categorize(), similarity(), mergeSignalIntoEvent()
│   └── event-store.ts             EventStore — upsert-with-dedup, JSON-per-event
├── graph/
│   └── knowledge-graph.ts         KnowledgeGraph — JSON-backed node/edge store         [shipped]
│       (roadmap: temporal edge decay, richer entity extraction beyond problem/technology)
├── agents/
│   ├── intelligence-agent.ts      One implementation, one instance per domain          [shipped]
│   ├── index.ts                   createDefaultIntelligenceAgents()                    [shipped]
│   ├── repository-analyst-agent.ts    Repository Intelligence                          [shipped]
│   ├── technology-radar-agent.ts      Technology Radar classification                  [shipped]
│   └── (roadmap) research-paper-analyst-agent.ts, startup-analyst-agent.ts,
│       benchmark-analyst-agent.ts, documentation-analyst-agent.ts,
│       api-change-analyst-agent.ts, security-analyst-agent.ts,
│       trend-analyst-agent.ts, opportunity-analyst-agent.ts
├── repository/                    Repository Intelligence                             [shipped]
│   ├── types.ts                   RepositoryProfile, MaintenanceStatus
│   └── repository-profile-store.ts    JSON-per-repository cache
├── radar/                         Technology Radar                                    [shipped]
│   ├── types.ts                   RadarRing, RadarEntry, RadarEvidence
│   ├── classify.ts                Deterministic evidence → ring classification
│   └── radar-store.ts             Single-snapshot JSON store
├── opportunity/
│   ├── scoring.ts                 ScoringEngine — 15-dimension OpportunityScore        [shipped]
│   └── opportunity-engine.ts      OpportunityEngine — merge signals into opportunities [shipped]
│       (roadmap: underserved-market/gap detection, not just tag-overlap merge)
├── history/
│   └── opportunity-store.ts       OpportunityStore — JSON-per-opportunity              [shipped]
├── profile/
│   └── builder-profile-store.ts   BuilderProfileStore — learned category weights       [shipped]
├── brief/
│   └── daily-brief.ts             DailyBriefGenerator                                  [shipped]
│       (roadmap) weekly-brief.ts, monthly-brief.ts — same pattern, longer window
└── (roadmap) recommendation/
    ├── project-matcher.ts         Match opportunities/radar movements to real projects
    └── recommendation-engine.ts   Rank recommendations across all of the above
```

## 6. Component diagram (text)

```
┌─────────────┐   Signal[]   ┌────────────┐  IntelligenceEvent  ┌────────────────┐
│  Collector   │ ───────────▶│ EventStore  │────────────────────▶│  KnowledgeGraph │
│ (per domain) │              │ .upsert()   │  (dedup + confidence│  (nodes+edges)  │
└─────────────┘              └────────────┘   combination)       └────────────────┘
                                     │                                     │
                                     ▼                                     ▼
                          ┌───────────────────┐                ┌────────────────────┐
                          │ BuilderProfileStore│                │ TechnologyRadarAgent│
                          │ (tag weights)      │                │ (ring classification│
                          └───────────────────┘                │  from graph evidence)│
                                     │                          └────────────────────┘
                                     ▼
                          ┌───────────────────┐
                          │ OpportunityEngine  │──────▶ OpportunityStore ──────▶ DailyBriefGenerator
                          │ (merge + score)    │
                          └───────────────────┘

┌────────────────────────┐        ┌────────────────────────┐
│ RepositoryAnalystAgent  │        │ (roadmap) other         │
│ (on-demand, real API,   │        │ specialized analysts:   │
│  cached by pushed_at)   │        │ paper/startup/benchmark/│
└────────────────────────┘        │ docs/api-change/security│
         │                        └────────────────────────┘
         ▼
 RepositoryProfileStore
```

## 7. Event flow

Two flows exist today, sharing one pipeline stage
(`InnovationModule.ingestSignal`, private, see `innovation/innovation-module.ts`):

**A. Scheduled/on-demand discovery cycle** (`runDiscoveryCycle`, `ash
innovation discover`, `POST /innovation/discover`):

```
for each domain in config.innovation.domains:
  IntelligenceAgent.execute()  → emits agent:started/finished
    → Collector.collect()  → Signal[]
  for each signal:
    EventStore.upsert(signal)        → emits innovation:event-created|merged
    KnowledgeGraph.upsertNode/addEdge
    BuilderProfileStore.recordSignal
    OpportunityEngine.ingest         → emits innovation:opportunity-created|updated
    OpportunityStore.save
emits innovation:cycle-finished
```

**B. Live GitHub discovery** (`runLiveGithubDiscovery`, `ash innovation
discover --live`, `POST /innovation/discover {live:true}`) — identical
per-signal pipeline, sourced from `liveGithubCollector` (a real GitHub
Search API call) instead of the domain sweep, and never runs unless
explicitly invoked.

**C. On-demand analysis** (not a "cycle" — single-entity, real-time):
`RepositoryAnalystAgent`/`TechnologyRadarAgent` run outside the discovery
loop entirely, invoked directly via `AshOS.runAgent(capability, task)`
(the same bypass-the-planner pattern `github-trending` uses), because
there's nothing for an LLM/planner to decide — the input (a repo name, or
"reclassify the graph") is deterministic.

**[roadmap]** A future Recommendation Engine flow would run periodically
*after* a discovery cycle finishes (subscribing to
`innovation:cycle-finished`), reading the updated graph/radar/opportunities
to produce ranked recommendations — without adding a third parallel
ingestion path.

## 8. Storage & persistence strategy

**[shipped]** No external database — every store is one JSON file per
record (or one snapshot file for small, whole-collection state), written
under `.ashos/innovation/` (project-scoped, git-ignored), mirroring
`OpportunityStore`/`MemoryManager`'s existing pattern exactly:

| Store | Layout | Rationale |
|---|---|---|
| `EventStore` | `events/<id>.json`, one per canonical event | Grows unboundedly but each record is independent — no lock contention, easy to inspect/`grep` on disk. |
| `RepositoryProfileStore` | `repositories/<owner>_<repo>.json` | Keyed by a filesystem-safe slug of `fullName`; naturally caches (see §16). |
| `RadarStore` | `radar.json`, one snapshot | Small (bounded by distinct technologies observed), always read/written whole — simpler than per-entry files for something this size. |
| `KnowledgeGraph` | `graph.json`, one snapshot | Same reasoning as radar; the graph is expected to stay in the thousands-of-nodes range for a single-user/small-team deployment, not millions. |
| `OpportunityStore`, `BuilderProfileStore` | (pre-existing) same pattern | Unchanged by this work. |

**Why not a real DB now**: zero-setup is a hard AshOS requirement (`ash
init && ash innovation discover` must work with no external service). JSON
files satisfy this and are trivial to back up, diff, and git-ignore.

**[roadmap]** If/when node/edge counts or query patterns outgrow
brute-force JSON scans (e.g. cross-project knowledge graphs with hundreds
of thousands of nodes), the natural next step is an embedded, zero-config
engine (SQLite via `better-sqlite3`, or a graph-specific embedded store)
behind the *same* `KnowledgeGraph`/`EventStore` interfaces — call sites
never need to change, only the class backing them.

## 9. Memory architecture

AshOS Intelligence's persistent state is **structured, domain-specific
memory**, distinct from but complementary to `MemoryManager`'s four scopes
(short-term/session/project/global — free-form key/value + semantic
search):

- The **Knowledge Graph** is long-term, structured memory: entities and
  their relationships, not opaque blobs. It's queried by kind/tag
  (`listNodes({kind})`, `neighbors(id)`), not similarity search.
- The **canonical event log** (`EventStore`) is an append-mostly (merge-or-
  create) episodic memory: "what happened, when, how confident are we, how
  many times was it corroborated."
- The **Builder Profile** is a compact, continuously-updated summary
  memory: not every signal, just the learned weight per category — the
  same role a running average plays versus keeping every data point.
- **[roadmap] Temporal reasoning**: today, "when" is a per-record
  timestamp compared against "now" at read time (e.g. the Technology
  Radar's `daysSinceLastSeen`). A richer temporal layer would let queries
  reason over trends explicitly — "how has this technology's
  mention-rate changed over the last 90 days," not just its current
  snapshot — most naturally implemented as periodic radar/graph snapshots
  retained over time (`radar-history/<date>.json`) rather than a single
  always-overwritten file, so the same brute-force JSON approach extends
  without a schema change.
- **Nothing here duplicates `MemoryManager`.** If an opportunity or
  repository analysis is worth recalling in a chat/planning context, it's
  still exposed through the normal REST/CLI surface for a user or agent to
  explicitly `ashos.memory.remember()` — Intelligence's stores are the
  source of truth, not a shadow copy of general memory.

## 10. Agent communication model

**[shipped]** Every Intelligence agent (`IntelligenceAgent` × 6 domains,
`RepositoryAnalystAgent`, `TechnologyRadarAgent`) is a normal `Agent`
registered on the **same shared `AgentRegistry`** every other AshOS agent
uses — routed by `capabilities: string[]`, not by a separate "intelligence
agent" concept. This means:

- The Planner could route a task to `intelligence:github` or
  `repository-analyst` exactly like it routes to `code`/`research`/`git`
  today — no special-casing.
- Agents communicate **indirectly**, through shared state and events, not
  direct method calls: an `IntelligenceAgent` writes signals; `EventStore`/
  `KnowledgeGraph`/`OpportunityEngine` read and transform them next; no
  agent calls another agent's `run()` directly. This keeps agents
  independently testable and replaceable.
- `AgentContext` (`{ provider, tools, eventBus, cwd }`) is the only thing
  injected into an agent — the same context shape used everywhere else,
  so a new specialized analyst agent needs no new wiring.
- Async notification is the `EventBus`: `innovation:event-created`,
  `innovation:repository-analyzed`, `innovation:radar-updated`, etc. — any
  future subscriber (a Recommendation Engine, a notification plugin) hooks
  in without the emitting agent knowing it exists.

**[roadmap]** Multi-agent *collaboration* (e.g. a Trend Analyst asking an
Opportunity Analyst to re-score something) is intentionally not built —
today's specialized agents are independent transformations over shared
persisted state, not a conversation between agents. If a future analyst
genuinely needs another analyst's fresh output mid-run, the extension
point is calling `AshOS.runAgent()` from within an agent's `run()`, which
already works today (same mechanism the CLI/API use) — no new
infrastructure required, just a judgment call on whether the coupling is
worth it.

## 11. Plugin architecture

**[shipped]** `PluginHost.innovation.collectors` (`kernel/types.ts`) lets
a plugin register a new `Collector` exactly like the built-in ones —
`host.innovation.collectors.register(myCollector)`. This is how a
real Hacker News/Reddit/arXiv/HuggingFace collector should be added going
forward: as a plugin (`plugins/<name>/index.ts`) or a built-in
`InnovationModule` registration, never a fork of the engine.

**[roadmap] Extending `PluginHost` for more than collectors**: today only
collectors are exposed to plugins; agents/stores are not yet
plugin-registerable for Intelligence specifically (though the general
`host.agents.register()` already works for a whole new agent — a plugin
can register a new specialized analyst today without any Intelligence-
specific plugin API). A future `PluginHost.innovation` could add
`radar: { registerRule() }` (custom classification rules) or
`events: { registerCategory() }` if third-party plugins need to extend the
closed `EventCategory` enum — not needed until a real use case demands it.

## 12. Scheduler architecture

**[shipped]** `Scheduler` (`scheduler/scheduler.ts`) is generic cron
infrastructure already in AshOS — a `ScheduledJob` is just `{ id, cron,
run() }`; nothing Intelligence-specific exists in the scheduler itself.
Wiring a recurring discovery cycle is:

```ts
scheduler.schedule({
  id: "daily-intelligence-sweep",
  cron: "0 7 * * *", // every morning at 07:00
  run: () => ashos.innovation.runDiscoveryCycle()
});
```

**Rate limits, retries, incremental sync** are each collector's own
responsibility, not the scheduler's — `github-releases-collector.ts`
demonstrates the pattern: a bounded per-topic query with a `pushed:>DATE`
filter (incremental — only recently-changed repos), tolerant of a single
failing/rate-limited topic (returns partial results rather than failing
the whole collector), and no built-in retry-with-backoff yet (**[roadmap]**
— a real 403/429 from GitHub's secondary rate limit today just fails that
one collection cleanly; a shared `withRetry()` helper for all real
collectors is a natural small addition once a second real collector
exists, to avoid duplicating backoff logic per collector).

**[roadmap]** A dedicated "Daily Research Workflow" job (see §17) that
chains discovery → radar refresh → brief generation as one scheduled unit,
rather than three independently-scheduled jobs, so `innovation:cycle-
finished` reliably precedes `radar-updated` reliably precedes a brief that
reflects the freshest data.

## 13. Recommendation pipeline

```
Signal → IntelligenceEvent → (feeds both) → KnowledgeGraph
                                           → OpportunityEngine → Opportunity
                                                                       │
                                                          ScoringEngine (15 dims)
                                                                       │
                                                     BuilderProfile-weighted
                                                     strategicAlignment/personalFit
                                                                       │
                                                          DailyBriefGenerator
                                                       (ranks + narrates) [shipped]
                                                                       │
                                            [roadmap] Recommendation Engine:
                                            cross-reference top opportunities +
                                            Technology Radar ring transitions +
                                            Project Matcher output → a single
                                            ranked "what to do next" list with
                                            impact/effort/confidence per item
```

Today's "recommendation" is the Daily Brief's top-N opportunities by
`score.overall` — real, working, but scoped to opportunities alone. The
roadmap item is broadening the ranking input to include radar movements
(a technology just flipped `emerging`→`growing`) and repository-portfolio
matches (see §14), producing a single unified list instead of three
separate views a user has to mentally merge themselves.

## 14. Opportunity Engine design

**[shipped]** `OpportunityEngine.ingest(opportunities, signal, profile)`
(`innovation/opportunity/opportunity-engine.ts`): for a new signal, find
the best-matching existing `Opportunity` by Jaccard tag-overlap; merge if
similarity ≥ `config.innovation.mergeThreshold` (default 0.5), else create
a new one. `ScoringEngine` recomputes all 15 dimensions
(`OPPORTUNITY_SCORE_DIMENSIONS`, `innovation/types.ts`) from scratch on
every merge — deterministic, pure functions of the opportunity's
accumulated signals plus the Builder Profile, no LLM in the loop (fast and
explainable; see `docs/innovation.md` for the full dimension list and the
cost-dimension inversion rule).

**[roadmap] Underserved-market / gap detection**: today, opportunities
only *emerge from* signals that directly describe a problem/idea (e.g. "a
complaint," "a product launch"). A gap-detection pass would instead
actively look for *absences* — e.g. a Technology Radar entry classified
`growing` with no corresponding repository/product signal addressing it
yet, surfaced as a candidate opportunity even though no single signal
proposed it. This is a genuinely new inference step (correlating across
the radar and the graph, not just merging signals) and is scoped as its
own future `OpportunityAnalystAgent` rather than a change to
`OpportunityEngine`'s merge logic.

## 15. Knowledge Graph design

**[shipped]** `KnowledgeGraph` (`innovation/graph/knowledge-graph.ts`) —
nodes typed by `KnowledgeNodeKind` (19 kinds defined in
`innovation/types.ts`: person, company, repository, product, idea,
problem, industry, technology, community, language, framework, market,
startup, paper, workflow, agent, project, skill, tool), de-duplicated by
`(kind, label)`; edges typed by `KnowledgeEdgeKind` (`relates-to`,
`produced-by`, `competes-with`, `part-of`, `mentions`, `solves`), each with
a `weight` that increments every time the same relationship is observed
again — repeated corroboration strengthens a relationship instead of
duplicating it. Today's discovery cycle populates only `problem` and
`technology` nodes connected by `relates-to`; the Technology Radar reads
`technology` nodes' aggregate edge weight as its "total mentions" evidence
(§18).

**[roadmap]**:
- **Richer entity extraction**: `repository`, `person`, `company`, `paper`
  nodes as first-class graph citizens (not just tags) once a collector
  supplies that structure — `RepositoryAnalystAgent`'s output is a natural
  first candidate to also write a `repository` node + `produced-by`/
  `mentions` edges, not just a `RepositoryProfileStore` record.
- **Temporal reasoning** over the graph (see §9) — currently
  "recency" is computed ad hoc per-consumer (the Radar does its own
  day-math); a shared temporal-query helper (`graph.trendsFor(nodeId,
  windowDays)`) would let any future consumer ask the same question
  without re-deriving it.
- **Relationship inference beyond direct co-occurrence** — e.g. inferring
  `competes-with` between two `startup` nodes that both `solve` the same
  `problem` node, rather than requiring a collector to assert it directly.

## 16. Repository Intelligence workflow

**[shipped]** End to end (`innovation/agents/repository-analyst-agent.ts`):

```
1. ash innovation repo analyze "owner/repo"  (or POST /innovation/repositories/analyze)
2. GET /repos/{fullName}                      — cheap: just to check pushed_at
3. compare against RepositoryProfileStore cache's pushedAt
     unchanged? → return cached profile immediately (no further API calls)
     changed?   → continue:
4. GET /repos/{fullName}/languages            — byte-count per language
5. GET /repos/{fullName}/contributors?per_page=1&anon=true
     → parse the `Link` response header's rel="last" page number for an
       accurate total without paginating through every contributor
6. GET /repos/{fullName}/contents/package.json (if present)
     → base64-decode, extract dependencies/devDependencies keys
7. compute maintenanceStatus/innovationScore/productionReadiness/
   adoptionPotential/ashosCompatibility — pure, documented heuristics,
   not an LLM call
8. RepositoryProfileStore.save(profile)
9. emit innovation:repository-analyzed
```

This is the concrete implementation of the design goal "never repeat
expensive analysis unless something changed" — step 3 is the one cheap
call that gates steps 4-6 behind an actual change, so re-running analysis
on an unchanged repository costs one API call, not four.

## 17. Daily research workflow

**[shipped, as "Daily Innovation Brief"]**:

```
ash innovation discover   (or scheduled)
  → signals → events → graph → opportunities (§7 flow A)
ash innovation brief      (or scheduled, after discover)
  → DailyBriefGenerator ranks opportunities by score.overall,
    asks the research provider for a short narrative,
    falls back to a plain summary if the provider is unreachable
```

**[roadmap] Full daily workflow** as originally specified — discovery →
radar refresh → repository re-analysis for tracked repos → brief
generation, as one scheduled, ordered unit (see §12) — is not wired up as
a single job yet; each piece works today but is triggered independently.
**[roadmap] Weekly/Monthly** rollups: same `DailyBriefGenerator` pattern
over a longer window, additionally summarizing Technology Radar ring
transitions and repository-portfolio deltas since the last report — a
CTO-level "board report" instead of a daily digest.

## 18. Technology Radar workflow

**[shipped]** (`innovation/agents/technology-radar-agent.ts`,
`innovation/radar/classify.ts`):

```
ash innovation radar --refresh   (or POST /innovation/radar/refresh)
  → for every `technology` node in KnowledgeGraph:
      totalMentions = sum of edge weights touching this node
      daysSinceFirstSeen = now - node.createdAt
      daysSinceLastSeen  = now - node.updatedAt
      mentionsPerDay     = totalMentions / max(1, daysSinceFirstSeen)
      classify (ordered rules):
        daysSinceLastSeen > 180        → obsolete
        daysSinceLastSeen > 60         → declining
        daysSinceFirstSeen ≤ 30
          AND totalMentions > 1        → emerging
        mentionsPerDay ≥ 0.5           → growing
        otherwise                      → stable
  → RadarStore.save(all entries as one snapshot)
  → emit innovation:radar-updated
```

Every classification carries its evidence (`RadarEvidence`) alongside the
ring — nothing is asserted as "emerging" without the numbers that produced
it, satisfying the "evidence-based" design goal without needing an LLM in
this path at all (the same reasoning `ScoringEngine` follows — deterministic
where possible, LLM narrative layered on top only where synthesis is
genuinely needed, as in the Daily Brief).

## 19. Public APIs

**REST** (base `http://localhost:4700`, see `docs/api.md` for the full
table including non-Intelligence routes):

| Method | Path | Purpose |
|---|---|---|
| POST | `/innovation/discover` | `{domains?, live?}` — start a discovery cycle |
| GET | `/innovation/status` | running state + config |
| GET | `/innovation/opportunities[/:id]` | ranked opportunities / one detail |
| GET | `/innovation/brief` | Daily Innovation Brief |
| GET | `/innovation/profile` | Builder Profile |
| GET | `/innovation/collectors` | registered (offline) collectors |
| GET | `/innovation/graph` | knowledge graph stats |
| GET | `/innovation/events[/:id]` | canonical deduplicated events |
| GET | `/innovation/repositories[/:owner/:repo]` | cached Repository Intelligence |
| POST | `/innovation/repositories/analyze` | `{fullName}` — analyze a repository |
| GET | `/innovation/radar` | current Technology Radar |
| POST | `/innovation/radar/refresh` | reclassify the radar |
| GET/PATCH | `/innovation/config` | Intelligence configuration |

**CLI** (see `docs/cli.md`): `ash innovation discover [--live] | list |
show <id> | brief | profile | collectors | events | repo analyze <o/r> |
repo list | radar [--refresh]`.

## 20. Internal APIs

The extension surfaces a new collector/agent/consumer actually codes
against:

```ts
// A new signal source — innovation/collectors/types.ts
interface Collector {
  id: string;
  domain: IntelligenceDomain;
  description: string;
  collect(): Promise<Signal[]>;
}

// A new specialized analyst agent — agents/types.ts (existing, unchanged)
interface Agent {
  name: string;
  description: string;
  capabilities: string[];
  execute(task: AgentTask, context: AgentContext): Promise<AgentResult>;
}

// Reading/writing canonical events — innovation/events/event-store.ts
class EventStore {
  upsert(signal: Signal): { event: IntelligenceEvent; created: boolean };
  get(id: string): IntelligenceEvent | undefined;
  list(): IntelligenceEvent[];
  byCategory(category: EventCategory): IntelligenceEvent[];
}

// Reading the graph a radar/analyst rule needs — innovation/graph/knowledge-graph.ts
class KnowledgeGraph {
  upsertNode(input: { kind, label, tags?, data? }): KnowledgeNode;
  addEdge(from: string, to: string, kind: KnowledgeEdgeKind): KnowledgeEdge;
  listNodes(filter?: { kind?: KnowledgeNodeKind }): KnowledgeNode[];
  neighbors(nodeId: string): KnowledgeEdge[];
  stats(): { nodeCount; edgeCount; byKind };
}
```

Everything else (`RepositoryProfileStore`, `RadarStore`,
`OpportunityStore`, `BuilderProfileStore`) follows the identical
`save()/get()/list()` shape — learn one, you've learned them all.

## 21. Extension points — how to add each kind of thing

| To add... | Do this | Touches the engine? |
|---|---|---|
| A new real collector (HN, Reddit, arXiv, HuggingFace, ...) | Implement `Collector`, register via `CollectorRegistry.register()` (built-in) or `PluginHost.innovation.collectors.register()` (plugin). If it should run by default, add to `config.innovation.domains`' matching agent; if opt-in like GitHub, expose it as a separate `runXDiscovery()` method. | No |
| A new specialized analyst agent | Extend `BaseAgent`, implement `run()`, register on `AgentRegistry` (`options.agents.register(new MyAgent())` in `InnovationModule`'s constructor, or via a plugin's `host.agents.register()`). Invoke via `AshOS.runAgent(capability, task)`. | No |
| A new event category | Add to `EVENT_CATEGORIES` (`innovation/events/types.ts`) and `categorize()`'s kind/tag mapping (`normalizer.ts`). | Small, additive |
| A new radar classification rule | Edit the ordered rules in `classify()` (`innovation/radar/classify.ts`) — pure function, fully unit-testable in isolation. | Small, additive |
| A new report cadence (weekly/monthly) | New generator class following `DailyBriefGenerator`'s shape, reading a longer window from the same stores. | No |
| A new persisted entity type | New `<Thing>Store` class following the `save()/get()/list()` shape under `.ashos/innovation/<thing>/`. | No |

## 22. Development roadmap (milestones)

- **M1 — Foundation [shipped, this document's slice]**: Event
  normalization + dedup; real opt-in GitHub collector; Repository
  Intelligence (`RepositoryAnalystAgent` + cache); Technology Radar
  (`TechnologyRadarAgent` + classification); REST/CLI/dashboard surfaces
  for all of the above; full test coverage, offline-safe by default.
- **M2 — More real collectors**: Hacker News, Reddit, arXiv, Papers With
  Code, package registries (npm/PyPI) — each following the exact
  `github-releases-collector.ts` pattern, gated by this environment's
  actual network reachability (verify before building, as GitHub was
  verified here).
- **M3 — Specialized research agents**: Research Paper Analyst, Startup
  Analyst, Benchmark Analyst, Documentation Analyst, API Change Analyst,
  Security Analyst, Trend Analyst, Opportunity Analyst — each a focused
  `Agent` producing structured knowledge into the same graph/event stores,
  following `RepositoryAnalystAgent`'s template.
- **M4 — Knowledge graph depth**: richer entity extraction (repository,
  person, company, paper as first-class nodes), a shared temporal-query
  helper, retained radar/graph snapshots for real trend analysis over
  time.
- **M5 — Recommendation layer**: Opportunity Engine gap/underserved-market
  detection, a Project Matcher (tie opportunities/radar movements to the
  user's actual projects, not just Builder Profile tag weights), a
  Recommendation Engine unifying opportunities + radar + project matches
  into one ranked list.
- **M6 — Reporting depth**: chained daily workflow (discovery → radar →
  brief as one scheduled unit), Weekly and Monthly executive-briefing
  reports summarizing radar transitions and portfolio deltas.
- **M7 — Production hardening**: shared retry/backoff for real collectors,
  collector plugin marketplace for community-contributed sources, secret
  management for any collector needing an API key, observability
  (per-collector success/failure/latency metrics feeding the existing
  event log).

## 23. Future directions (long-term, beyond this roadmap)

- Cross-project portfolio view: run Repository Intelligence + Technology
  Radar against a user's *own* repositories, not just external ones —
  "which of my own projects use a `declining` technology?"
- Multi-source corroboration weighting: today confidence-combination
  treats every source equally; a future version could weight sources by
  historical reliability.
- Opportunity vetting via structured multi-agent review (e.g. an
  Opportunity Analyst's proposal reviewed by a Technical-Difficulty-
  focused pass before scoring) — deliberately not built now per §10's
  reasoning that agent-to-agent coupling should wait for a real need.
- Notification/delivery plugins (Slack/email digest of the Daily Brief) —
  a natural `PluginHost` extension once the report pipeline (M6) exists.
- Natural-language querying over the knowledge graph ("what have you
  learned about vector databases this month?") — layers on top of §9's
  temporal reasoning once it exists, via the existing chat/provider
  surface rather than a new query language.
