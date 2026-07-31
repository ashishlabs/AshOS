import type { AIProvider } from "../../providers/types";
import type { DailyBrief, Opportunity } from "../types";

export interface DailyBriefOptions {
  size?: number;
  provider?: AIProvider;
}

/**
 * "Daily Innovation Brief": an executive summary of what's most worth
 * building right now. The ranked opportunity list itself is deterministic
 * (sorted by `score.overall`, no LLM required — so `ash innovation brief`
 * always works offline); the narrative paragraph is a best-effort call to
 * the configured research provider, same "never hard-fail" pattern as
 * `Researcher`/`Planner` — an unreachable provider falls back to a plain,
 * still-useful summary instead of erroring.
 */
export class DailyBriefGenerator {
  async generate(opportunities: Opportunity[], newSignalCount: number, options: DailyBriefOptions = {}): Promise<DailyBrief> {
    const size = options.size ?? 5;
    const topOpportunities = [...opportunities].sort((a, b) => b.score.overall - a.score.overall).slice(0, size);
    const domainsCovered = [...new Set(topOpportunities.flatMap((o) => o.domains))];

    return {
      generatedAt: new Date().toISOString(),
      topOpportunities,
      newSignalCount,
      domainsCovered,
      narrative: await this.narrate(topOpportunities, options.provider)
    };
  }

  private async narrate(top: Opportunity[], provider?: AIProvider): Promise<string> {
    if (top.length === 0) {
      return "No opportunities discovered yet — run `ash innovation discover` to start building the knowledge graph.";
    }
    if (!provider) return this.fallbackNarrative(top);

    try {
      const { content } = await provider.chat(
        [
          {
            role: "system",
            content:
              "You are AshOS's Daily Innovation Brief writer. In 3-5 sentences, tell the user what's most interesting today and why it matters, like a technical co-founder giving a morning update."
          },
          {
            role: "user",
            content: top.map((o, i) => `${i + 1}. ${o.title} (score ${o.score.overall.toFixed(2)}, stage ${o.stage}): ${o.problemStatement}`).join("\n")
          }
        ],
        { temperature: 0.5 }
      );
      return content;
    } catch {
      return this.fallbackNarrative(top);
    }
  }

  private fallbackNarrative(top: Opportunity[]): string {
    const plural = top.length === 1 ? "opportunity" : "opportunities";
    return `Top opportunity today: "${top[0].title}" (score ${top[0].score.overall.toFixed(2)}). ${top.length} ${plural} worth a look.`;
  }
}
