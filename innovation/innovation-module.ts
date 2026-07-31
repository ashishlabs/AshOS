import type { Kernel } from "../kernel/kernel";
import type { ProviderRegistry } from "../providers/registry";
import type { AgentRegistry } from "../agents/registry";
import type { ToolRegistry } from "../tools/registry";
import type { AgentContext } from "../agents/types";
import type { IntelligenceDomain } from "../kernel/config";
import { CollectorRegistry } from "./collectors/registry";
import { createDefaultIntelligenceAgents } from "./agents/index";
import { KnowledgeGraph } from "./graph/knowledge-graph";
import { OpportunityStore } from "./history/opportunity-store";
import { BuilderProfileStore } from "./profile/builder-profile-store";
import { ScoringEngine } from "./opportunity/scoring";
import { OpportunityEngine } from "./opportunity/opportunity-engine";
import { DailyBriefGenerator } from "./brief/daily-brief";
import type { DailyBrief, Opportunity, Signal } from "./types";

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
 * Wires every innovation/* piece together: pre-registers one mock Collector
 * + IntelligenceAgent per domain into the shared `AgentRegistry` (so they're
 * routable like any other agent, e.g. by the Planner), and constructs the
 * graph/store/engine collaborators. The one orchestration entry point is
 * `runDiscoveryCycle()`: run each domain's agent -> collect Signals ->
 * record them in the KnowledgeGraph -> merge them into Opportunities via
 * OpportunityEngine -> persist -> reinforce the BuilderProfile. Nothing here
 * runs unless `runDiscoveryCycle()` is called (via `ash innovation
 * discover`, `POST /innovation/discover`, or a scheduled job) — no
 * auto-start-on-boot behavior.
 */
export class InnovationModule {
  readonly collectors = new CollectorRegistry();
  readonly graph: KnowledgeGraph;
  readonly opportunities: OpportunityStore;
  readonly profile: BuilderProfileStore;
  readonly scoring = new ScoringEngine();
  readonly engine: OpportunityEngine;
  readonly briefGenerator = new DailyBriefGenerator();

  constructor(private readonly options: InnovationModuleOptions) {
    for (const agent of createDefaultIntelligenceAgents(this.collectors)) {
      options.agents.register(agent);
    }

    this.graph = new KnowledgeGraph(options.kernel.root);
    this.opportunities = new OpportunityStore(options.kernel.root);
    this.profile = new BuilderProfileStore(options.kernel.root);
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
        this.recordSignalInGraph(signal);
        const profile = this.profile.recordSignal(signal.tags);

        const ingested = this.engine.ingest(opportunities, signal, profile);
        opportunities = ingested.opportunities;
        this.opportunities.save(ingested.opportunity);
        this.options.kernel.eventBus.emit(ingested.created ? "innovation:opportunity-created" : "innovation:opportunity-updated", {
          id: ingested.opportunity.id,
          title: ingested.opportunity.title
        });
        signalCount++;
      }
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
