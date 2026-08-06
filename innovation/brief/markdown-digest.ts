import type { Opportunity, Signal } from "../types";
import type { LiveSourceResult } from "../innovation-module";

const SOURCE_LABELS: Record<string, string> = {
  "github-live": "GitHub",
  "hn-live": "Hacker News",
  "reddit-live": "Reddit",
  "arxiv-live": "arXiv",
  "huggingface-live": "Hugging Face",
  "product-hunt-live": "Product Hunt"
};

export interface DigestInput {
  generatedAt: string;
  sources: LiveSourceResult[];
  topOpportunities: Opportunity[];
}

function renderSignal(signal: Signal): string {
  const link = signal.url ? `[${signal.title}](${signal.url})` : signal.title;
  return `- ${link} — ${signal.summary}`;
}

/**
 * Pure function turning one `runLiveDiscovery()` result into a scannable
 * Markdown report — literally "today's AI news," grouped by real source,
 * with an honest "no new items" line rather than pretending every source
 * always has something. Deterministic, no LLM in the loop (same reasoning
 * as `ScoringEngine`/`classify.ts`) — a digest is a fact sheet, not a
 * narrative; `DailyBriefGenerator` already covers the narrative case for
 * opportunities specifically.
 */
export function buildMarkdownDigest(input: DigestInput): string {
  const { generatedAt, sources, topOpportunities } = input;
  const date = generatedAt.slice(0, 10);
  const totalSignals = sources.reduce((sum, s) => sum + s.signals.length, 0);
  const errored = sources.filter((s) => s.error);

  const lines: string[] = [
    `# AshOS Daily AI News Digest — ${date}`,
    "",
    `Generated ${generatedAt} from ${sources.length} source(s): ${totalSignals} item(s) captured` +
      (errored.length ? `, ${errored.length} source(s) unavailable this run.` : "."),
    ""
  ];

  for (const source of sources) {
    const label = SOURCE_LABELS[source.id] ?? source.id;
    lines.push(`## ${label} (${source.id})`, "");
    if (source.error) {
      lines.push(`⚠️ Unavailable this run: ${source.error}`);
    } else if (source.signals.length === 0) {
      lines.push("No new items in this run.");
    } else {
      for (const signal of source.signals) lines.push(renderSignal(signal));
    }
    lines.push("");
  }

  if (topOpportunities.length > 0) {
    lines.push("## Notable opportunities so far", "");
    for (const o of topOpportunities) {
      lines.push(`- **${o.title}** (score ${o.score.overall.toFixed(2)}, stage ${o.stage})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
