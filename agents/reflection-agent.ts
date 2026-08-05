import { BaseAgent } from "./base-agent";
import type { AgentContext, AgentResult, AgentTask } from "./types";
import { MemoryManager } from "../memory/memory-manager";
import { InboxManager } from "../inbox/inbox-manager";
import { KnowledgeGraph } from "../graph/knowledge-graph";
import { buildReflectionData, fallbackNarrative, isReflectionDataEmpty, type ReflectionData, type ReflectionPeriod } from "./reflection";

const KNOWN_PERIODS: ReadonlySet<ReflectionPeriod> = new Set(["daily", "weekly", "monthly"]);

const SYSTEM_PROMPT: Record<ReflectionPeriod, string> = {
  daily: "You are AshOS's Reflection Agent writing a short daily review. In 2-4 sentences, summarize what got done, call out any failures worth a second look, and suggest one thing to focus on next, like a colleague giving an honest end-of-day recap.",
  weekly: "You are AshOS's Reflection Agent writing a weekly review. In 3-5 sentences, summarize the week's work, knowledge captured, and any recurring failures, and recommend where to focus next week.",
  monthly: "You are AshOS's Reflection Agent writing a monthly review. In 4-6 sentences, summarize the month's progress, knowledge growth, and notable failure patterns, and recommend strategic focus for next month."
};

/**
 * Reflection Agent — closes the "Reflection" Smart Agent gap (Second
 * Brain roadmap Tier 2 item 5, `docs/second-brain-roadmap.md`): a daily/
 * weekly/monthly review narrative, same shape as `DailyBriefGenerator`
 * (deterministic data gathering, then a best-effort LLM narrative with a
 * graceful offline fallback) but reading Outcome Memory + Inbox +
 * (general) Knowledge Graph activity within the period window instead of
 * Innovation opportunities. Constructs its own file-backed collaborators
 * fresh from `context.cwd`, the same convention `TechnologyRadarAgent`/
 * `RepositoryAnalystAgent`/`IdeaAgent` already use.
 */
export class ReflectionAgent extends BaseAgent {
  name = "reflection";
  description = "Generates a daily/weekly/monthly review narrative from Outcome Memory, Inbox, and Knowledge Graph activity";
  capabilities = ["reflection"];

  async run(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const input = task.input ?? {};
    const requestedPeriod = input.period as ReflectionPeriod | undefined;
    const period: ReflectionPeriod = requestedPeriod && KNOWN_PERIODS.has(requestedPeriod) ? requestedPeriod : "daily";

    const memory = new MemoryManager(context.cwd);
    const inbox = new InboxManager(memory);
    const graph = new KnowledgeGraph(context.cwd);

    const data = buildReflectionData({
      period,
      outcomeRecords: memory.query({ scope: "project", tag: "outcome" }),
      inboxItems: inbox.list(),
      graphNodes: graph.listNodes()
    });

    const narrative = await this.narrate(data, context);

    return { ok: true, output: narrative, data: { ...data, narrative } };
  }

  private async narrate(data: ReflectionData, context: AgentContext): Promise<string> {
    if (isReflectionDataEmpty(data)) return fallbackNarrative(data);

    try {
      const { content } = await context.provider.chat(
        [
          { role: "system", content: SYSTEM_PROMPT[data.period] },
          { role: "user", content: JSON.stringify(data, null, 2) }
        ],
        { temperature: 0.5 }
      );
      return content;
    } catch {
      return fallbackNarrative(data);
    }
  }
}
