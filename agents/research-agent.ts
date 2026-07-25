import { BaseAgent } from "./base-agent";
import type { AgentContext, AgentResult, AgentTask } from "./types";

/**
 * Produces a research summary for a topic using the active AIProvider.
 * Intended to be composed with a real web-search tool via a plugin; without
 * one, it summarizes from the model's own knowledge and says so.
 */
export class ResearchAgent extends BaseAgent {
  name = "research";
  description = "Researches a topic and produces a structured summary";
  capabilities = ["research", "summarize"];

  async run(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const searchTool = context.tools.get("web-search");
    let findings = "";
    if (searchTool) {
      const result = await searchTool.execute({ action: "search", args: { query: task.description } });
      findings = result.output ?? "";
    }

    const { content } = await context.provider.chat([
      {
        role: "system",
        content:
          "You are a research assistant. Produce a concise, structured summary with headings: Overview, Key Points, Risks, Recommendation."
      },
      {
        role: "user",
        content: findings
          ? `Topic: ${task.description}\n\nSearch findings:\n${findings}`
          : `Topic: ${task.description}\n\n(no web search tool available; answer from general knowledge and say so)`
      }
    ]);

    return { ok: true, output: content };
  }
}
