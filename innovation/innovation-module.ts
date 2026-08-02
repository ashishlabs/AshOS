import type { Kernel } from "../kernel/kernel";
import type { ProviderRegistry } from "../providers/registry";
import type { AgentRegistry } from "../agents/registry";
import type { ToolRegistry } from "../tools/registry";
import type { AgentContext } from "../agents/types";
import type { IntelligenceDomain } from "../kernel/config";
import { CollectorRegistry } from "./collectors/registry";
import { createGithubReleasesCollector } from "./collectors/github-releases-collector";
import { createDefaultIntelligenceAgents } from "./agents/index";
import { RepositoryAnalystAgent } from "./agents/repository-analyst-agent";
import { TechnologyRadarAgent } from "./agents/technology-radar-agent";
import { KnowledgeGraph } from "./graph/knowledge-graph";
import { OpportunityStore } from "./history/opportunity-store";
import { BuilderProfileStore } from "./profile/builder-profile-store";
import { ScoringEngine } from "./opportunity/scoring";
import { OpportunityEngine } from "./opportunity/opportunity-engine";
import { DailyBriefGenerator } from "./brief/daily-brief";
import { EventStore } from "./events/event-store";
import { RepositoryProfileStore } from "./repository/repository-profile-store";
import { RadarStore } from "./radar/radar-store";
import type { DailyBrief, Opportunity, Signal } from "./types";
import type { Collector } from "./collectors/types";

export interface InnovationModuleOptions {
  kernel: Kernel;
  providers: ProviderRegistry;
  agents: AgentRegistry;
  tools: ToolRegistry;
}

export interface DiscoveryCycleResult {
  opportunities: Opportunity[];
  signalCount: number;
}

/**
 * Wires every innovation/* piece together — this is "AshOS Intelligence":
 * pre-registers one mock Collector + IntelligenceAgent per domain, plus the
 * RepositoryAnalyst and TechnologyRadar agents, into the shared
 * `AgentRegistry` (so they're routable like any other agent), and
 * constructs the graph/store/engine collaborators. The one orchestration
 * entry point is `runDiscoveryCycle()`: run each domain's agent -> collect
 * Signals -> normalize+dedupe into canonical IntelligenceEvents -> record in
 * the KnowledgeGraph -> merge into Opportunities via OpportunityEngine ->
 * persist -> reinforce the BuilderProfile. Nothing here runs unless
 * `runDiscoveryCycle()` is called (via `ash innovation discover`,
 * `POST /innovation/discover`, or a scheduled job) — no auto-start-on-boot
 * behavior. See `docs/ashos-intelligence.md` for the full design.
 */
export class InnovationModule {
  readonly collectors = new CollectorRegistry();
  readonly graph: KnowledgeGraph;
  readonly opportunities: OpportunityStore;
  readonly profile: BuilderProfileStore;
  readonly events: EventStore;
  readonly repositories: RepositoryProfileStore;
  readonly radar: RadarStore;
  readonly scoring = new ScoringEngine();
  readonly engine: OpportunityEngine;
  readonly briefGenerator = new DailyBriefGenerator();
  /**
   * Real, network-backed GitHub collector — deliberately NOT registered on
   * `this.collectors` (which only ever holds the deterministic, offline-by-
   * default collectors `IntelligenceAgent` sweeps automatically for its
   * domain). Registering it there would make every `ash innovation
   * discover`/`POST /innovation/discover` call hit the real network by
   * default, breaking the "offline unless you opt in" guarantee the rest of
   * AshOS relies on for tests and zero-setup use. It only runs via the
   * explicit `runLiveGithubDiscovery()` entry point below.
   */
  readonly liveGithubCollector: Collector = createGithubReleasesCollector();

  constructor(private readonly options: InnovationModuleOptions) {
    for (const agent of createDefaultIntelligenceAgents(this.collectors)) {
      options.agents.register(agent);
    }
    options.agents.register(new RepositoryAnalystAgent());
    options.agents.register(new TechnologyRadarAgent());

    this.graph = new KnowledgeGraph(options.kernel.root);
    this.opportunities = new OpportunityStore(options.kernel.root);
    this.profile = new BuilderProfileStore(options.kernel.root);
    this.events = new EventStore(options.kernel.root);
    this.repositories = new RepositoryProfileStore(options.kernel.root);
    this.radar = new RadarStore(options.kernel.root);
    this.engine = new OpportunityEngine({ scoring: this.scoring, mergeThreshold: options.kernel.config.innovation.mergeThreshold });
  }

  private agentContext(): AgentContext {
    return {
      provider: this.options.providers.get(this.options.kernel.config.innovation.researchProvider),
      tools: this.options.tools,
      eventBus: this.options.kernel.eventBus,
      cwd: this.options.kernel.root
    };
  }

  /** Records a signal's problem and its tags as connected knowledge-graph nodes, not just a document in a list. */
  private recordSignalInGraph(signal: Signal): void {
    const problemNode = this.graph.upsertNode({
      kind: "problem",
      label: signal.title,
      tags: signal.tags,
      data: { domain: signal.domain, source: signal.source, kind: signal.kind }
    });
    for (const tag of signal.tags) {
      const technologyNode = this.graph.upsertNode({ kind: "technology", label: tag });
      this.graph.addEdge(problemNode.id, technologyNode.id, "relates-to");
    }
  }

  /**
   * The shared per-signal pipeline stage used by both a normal domain-agent
   * discovery cycle and `runLiveGithubDiscovery()`: normalize+dedupe into a
   * canonical event, record the knowledge-graph relationship, reinforce the
   * builder profile, then merge into an Opportunity. Kept as one method so
   * the two callers can never drift apart.
   */
  private ingestSignal(signal: Signal, opportunities: Opportunity[]): Opportunity[] {
    const { event, created } = this.events.upsert(signal);
    this.options.kernel.eventBus.emit(created ? "innovation:event-created" : "innovation:event-merged", { id: event.id, title: event.title });

    this.recordSignalInGraph(signal);
    const profile = this.profile.recordSignal(signal.tags);

    const ingested = this.engine.ingest(opportunities, signal, profile);
    this.opportunities.save(ingested.opportunity);
    this.options.kernel.eventBus.emit(ingested.created ? "innovation:opportunity-created" : "innovation:opportunity-updated", {
      id: ingested.opportunity.id,
      title: ingested.opportunity.title
    });
    return ingested.opportunities;
  }

  async runDiscoveryCycle(domains?: IntelligenceDomain[]): Promise<DiscoveryCycleResult> {
    const targetDomains = domains ?? this.options.kernel.config.innovation.domains;
    this.options.kernel.eventBus.emit("innovation:cycle-started", { domains: targetDomains });

    const context = this.agentContext();
    let opportunities = this.opportunities.list();
    let signalCount = 0;

    for (const domain of targetDomains) {
      const agent = this.options.agents.findByCapability(`intelligence:${domain}`);
      if (!agent) continue;

      const result = await agent.execute({ id: `discover-${domain}-${Date.now()}`, description: `discover ${domain} signals` }, context);
      const signals = (result.data as { signals?: Signal[] } | undefined)?.signals ?? [];

      for (const signal of signals) {
        opportunities = this.ingestSignal(signal, opportunities);
        signalCount++;
      }
    }

    this.options.kernel.eventBus.emit("innovation:cycle-finished", { signalCount, opportunityCount: opportunities.length });
    return { opportunities, signalCount };
  }

  /**
   * Opt-in real-network counterpart to `runDiscoveryCycle`: runs only
   * `liveGithubCollector` (a genuine GitHub Search API call) through the
   * exact same normalize -> graph -> profile -> opportunity pipeline.
   * Never runs automatically — invoked explicitly via `ash innovation
   * discover --live` or `POST /innovation/discover` with `{ live: true }`.
   */
  async runLiveGithubDiscovery(): Promise<DiscoveryCycleResult> {
    this.options.kernel.eventBus.emit("innovation:cycle-started", { domains: ["github"], live: true });

    let opportunities = this.opportunities.list();
    let signalCount = 0;

    const signals = await this.liveGithubCollector.collect();
    for (const signal of signals) {
      opportunities = this.ingestSignal(signal, opportunities);
      signalCount++;
    }

    this.options.kernel.eventBus.emit("innovation:cycle-finished", { signalCount, opportunityCount: opportunities.length });
    return { opportunities, signalCount };
  }

  async generateBrief(): Promise<DailyBrief> {
    const opportunities = this.opportunities.list();
    const newSignalCount = opportunities.reduce((sum, o) => sum + o.signals.length, 0);
    return this.briefGenerator.generate(opportunities, newSignalCount, {
      size: this.options.kernel.config.innovation.briefSize,
      provider: this.options.providers.get(this.options.kernel.config.innovation.researchProvider)
    });
  }
}
