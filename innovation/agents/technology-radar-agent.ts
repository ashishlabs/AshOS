import { BaseAgent } from "../../agents/base-agent";
import type { AgentContext, AgentResult, AgentTask } from "../../agents/types";
import { KnowledgeGraph } from "../../graph/knowledge-graph";
import { RadarStore } from "../radar/radar-store";
import { buildRadarEntry } from "../radar/classify";
import type { RadarEntry } from "../radar/types";

/**
 * Maintains the "living radar" from the design doc: classifies every
 * `technology` node already recorded in the KnowledgeGraph (one per tag
 * ever seen on a signal, see `InnovationModule.recordSignalInGraph`) into
 * emerging/growing/stable/declining/obsolete, with numeric evidence. Pure
 * logic over data AshOS already collected — no network call, no LLM,
 * deterministic and cheap to re-run after every discovery cycle.
 */
export class TechnologyRadarAgent extends BaseAgent {
  name = "technology-radar";
  description = "Classifies tracked technologies into emerging/growing/stable/declining/obsolete, with evidence";
  capabilities = ["technology-radar"];

  async run(_task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const graph = new KnowledgeGraph(context.cwd, { namespace: "innovation" });
    const store = new RadarStore(context.cwd);

    const technologyNodes = graph.listNodes({ kind: "technology" });
    const entries: RadarEntry[] = technologyNodes.map((node) => {
      const totalMentions = graph.neighbors(node.id).reduce((sum, n) => sum + n.edge.weight, 0);
      return buildRadarEntry(node.label, totalMentions, node.createdAt, node.updatedAt);
    });

    store.save(entries);
    context.eventBus?.emit("innovation:radar-updated", { count: entries.length });

    const byRing = entries.reduce<Record<string, number>>((acc, e) => {
      acc[e.ring] = (acc[e.ring] ?? 0) + 1;
      return acc;
    }, {});

    return {
      ok: true,
      output: entries.length
        ? `Radar: ${Object.entries(byRing).map(([ring, count]) => `${count} ${ring}`).join(", ")}.`
        : "No technologies tracked yet — run a discovery cycle first.",
      data: { entries, byRing }
    };
  }
}
