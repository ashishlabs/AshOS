import { BaseAgent } from "./base-agent";
import type { AgentContext, AgentResult, AgentTask } from "./types";

const URL_RE = /https?:\/\/\S+/i;

/**
 * Produces a research summary for a topic using the active AIProvider.
 * Still checks for a "web-search" tool (topic -> URLs) via a plugin, none
 * shipped by default. Additionally grounds the summary in a URL's actual
 * fetched text when the task description contains one, via the `web-fetch`
 * tool (`tools/web-fetch-tool.ts`, registered by default in `sdk/ashos.ts`)
 * — the same "ground a summary in real fetched content" pattern
 * `InboxManager`'s AI summarizer already established for captured links.
 * Closes part of North Star goal #8 (Autonomous Research); without either
 * tool, or with a URL that fails to fetch, falls back to reasoning from the
 * model's own knowledge and says so.
 */
export class ResearchAgent extends BaseAgent {
  name = "research";
  description = "Researches a topic and produces a structured summary";
  capabilities = ["research", "summarize"];

  async run(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const findings: string[] = [];

    const searchTool = context.tools.get("web-search");
    if (searchTool) {
      const result = await searchTool.execute({ action: "search", args: { query: task.description } });
      if (result.output) findings.push(result.output);
    }

    const url = task.description.match(URL_RE)?.[0];
    const fetchTool = url ? context.tools.get("web-fetch") : undefined;
    if (fetchTool) {
      try {
        const result = await fetchTool.execute({ action: "fetch", args: { url } });
        if (result.ok && result.output) findings.push(result.output);
      } catch {
        // best-effort — a blocked/timed-out/failed fetch just means the summary falls back to model knowledge alone
      }
    }

    const findingsText = findings.join("\n\n---\n\n");

    const { content } = await context.provider.chat([
      {
        role: "system",
        content:
          "You are a research assistant. Produce a concise, structured summary with headings: Overview, Key Points, Risks, Recommendation."
      },
      {
        role: "user",
        content: findingsText
          ? `Topic: ${task.description}\n\nSearch findings:\n${findingsText}`
          : `Topic: ${task.description}\n\n(no web search tool available; answer from general knowledge and say so)`
      }
    ]);

    return { ok: true, output: content };
  }
}
