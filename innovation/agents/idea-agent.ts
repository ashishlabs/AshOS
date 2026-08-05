import { randomUUID } from "node:crypto";
import { BaseAgent } from "../../agents/base-agent";
import type { AgentContext, AgentResult, AgentTask } from "../../agents/types";
import type { IntelligenceDomain } from "../../kernel/config";
import { MemoryManager } from "../../memory/memory-manager";
import { InboxManager } from "../../inbox/inbox-manager";
import { KnowledgeGraph } from "../../graph/knowledge-graph";
import { OpportunityStore } from "../history/opportunity-store";
import { BuilderProfileStore } from "../profile/builder-profile-store";
import { EventStore } from "../events/event-store";
import { ScoringEngine } from "../opportunity/scoring";
import { OpportunityEngine } from "../opportunity/opportunity-engine";
import type { Signal } from "../types";

const KNOWN_DOMAINS: ReadonlySet<IntelligenceDomain> = new Set(["market", "github", "community", "research", "workflow", "competitor"]);

/**
 * Mirrors `kernel/config.ts`'s `defaultConfig().innovation.mergeThreshold`.
 * Every innovation agent (`TechnologyRadarAgent`, `RepositoryAnalystAgent`)
 * constructs its own file-backed collaborators fresh from `context.cwd`
 * rather than reading `Kernel.config` (which `AgentContext` doesn't carry),
 * so this agent follows the same convention — callers that hold the real
 * configured value (CLI/API, via `ashos.kernel.config.innovation.mergeThreshold`)
 * can still override it through `task.input.mergeThreshold`.
 */
const DEFAULT_MERGE_THRESHOLD = 0.5;

/**
 * Idea Agent — closes the "Idea Lab" gap (Second Brain roadmap Tier 2 item
 * 4, `docs/second-brain-roadmap.md`) by promoting a Universal Inbox item
 * (or any raw text) into a scored, dedupe-aware Innovation `Opportunity`.
 * Deliberately reuses the *exact* pipeline
 * `InnovationModule.runDiscoveryCycle()` uses for collector-sourced
 * signals — `ScoringEngine`, `OpportunityEngine`, `EventStore`,
 * `BuilderProfileStore`, the namespaced Knowledge Graph — instead of a
 * second "idea score" concept. Combining near-duplicate ideas and
 * detecting duplicates both fall out of `OpportunityEngine`'s existing
 * tag-overlap (Jaccard) merge logic for free.
 */
export class IdeaAgent extends BaseAgent {
  name = "idea";
  description = "Scores and dedupes a captured idea (Inbox item or raw text) into a ranked Innovation Opportunity";
  capabilities = ["idea"];

  async run(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const input = task.input ?? {};
    const inboxId = typeof input.inboxId === "string" ? input.inboxId : undefined;
    const explicitContent = typeof input.content === "string" ? input.content : undefined;

    const memory = new MemoryManager(context.cwd);
    const inbox = new InboxManager(memory);

    const sourceItem = inboxId ? inbox.get(inboxId) : undefined;
    if (inboxId && !sourceItem) {
      return { ok: false, error: `inbox item "${inboxId}" not found` };
    }

    const content = explicitContent ?? sourceItem?.content;
    if (!content) {
      return { ok: false, error: "idea agent requires 'inboxId' or 'content' in task input" };
    }

    const requestedDomain = input.domain as IntelligenceDomain | undefined;
    const domain: IntelligenceDomain = requestedDomain && KNOWN_DOMAINS.has(requestedDomain) ? requestedDomain : "workflow";
    const extraTags = Array.isArray(input.tags) ? (input.tags as string[]) : [];
    const mergeThreshold = typeof input.mergeThreshold === "number" ? input.mergeThreshold : DEFAULT_MERGE_THRESHOLD;

    const signal: Signal = {
      id: sourceItem?.id ?? randomUUID(),
      domain,
      kind: "feature-request",
      source: sourceItem ? `inbox:${sourceItem.id}` : "idea-agent",
      title: content.length > 80 ? `${content.slice(0, 77)}...` : content,
      summary: content,
      tags: [...new Set([...extraTags, ...(sourceItem?.tags ?? [])])],
      confidence: 0.6,
      observedAt: new Date().toISOString()
    };

    const events = new EventStore(context.cwd);
    const graph = new KnowledgeGraph(context.cwd, { namespace: "innovation" });
    const profileStore = new BuilderProfileStore(context.cwd);
    const opportunityStore = new OpportunityStore(context.cwd);
    const engine = new OpportunityEngine({ scoring: new ScoringEngine(), mergeThreshold });

    const { event, created: eventCreated } = events.upsert(signal);
    context.eventBus?.emit(eventCreated ? "innovation:event-created" : "innovation:event-merged", { id: event.id, title: event.title });

    this.recordSignalInGraph(graph, signal);
    const profile = profileStore.recordSignal(signal.tags);

    const ingested = engine.ingest(opportunityStore.list(), signal, profile);
    opportunityStore.save(ingested.opportunity);
    context.eventBus?.emit(ingested.created ? "innovation:opportunity-created" : "innovation:opportunity-updated", {
      id: ingested.opportunity.id,
      title: ingested.opportunity.title
    });

    if (sourceItem) {
      await inbox.updateStatus(sourceItem.id, "reviewed");
    }

    return {
      ok: true,
      output: `${ingested.created ? "Created" : "Merged into"} opportunity "${ingested.opportunity.title}" (score ${ingested.opportunity.score.overall.toFixed(2)})`,
      data: { opportunity: ingested.opportunity, created: ingested.created }
    };
  }

  /** Same graph-recording shape as `InnovationModule`'s private `recordSignalInGraph` — a problem node plus one technology node per tag, connected `relates-to`. */
  private recordSignalInGraph(graph: KnowledgeGraph, signal: Signal): void {
    const problemNode = graph.upsertNode({
      kind: "problem",
      label: signal.title,
      tags: signal.tags,
      data: { domain: signal.domain, source: signal.source, kind: signal.kind }
    });
    for (const tag of signal.tags) {
      const technologyNode = graph.upsertNode({ kind: "technology", label: tag });
      graph.addEdge(problemNode.id, technologyNode.id, "relates-to");
    }
  }
}
