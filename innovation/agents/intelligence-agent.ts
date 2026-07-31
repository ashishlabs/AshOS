import { BaseAgent } from "../../agents/base-agent";
import type { AgentContext, AgentResult, AgentTask } from "../../agents/types";
import type { IntelligenceDomain } from "../../kernel/config";
import type { CollectorRegistry } from "../collectors/registry";
import type { Signal } from "../types";

const DOMAIN_DESCRIPTIONS: Record<IntelligenceDomain, string> = {
  market: "Monitors startups, SaaS launches, funding and acquisitions for emerging categories and underserved markets.",
  github: "Monitors trending/fast-growing repositories, issues and feature requests for ecosystem gaps and automation opportunities.",
  community: "Monitors Reddit/Hacker News/Dev.to/Stack Overflow style discussions for complaints, repeated questions and missing tooling.",
  research: "Tracks arXiv/Hugging Face/model releases and benchmark improvements, converting research into practical software opportunities.",
  workflow: "Observes real-world professional workflows for repetitive, manual, automatable bottlenecks.",
  competitor: "Tracks competitor pricing, features, reviews and roadmap changes for market gaps."
};

export interface IntelligenceAgentOptions {
  domain: IntelligenceDomain;
  collectors: CollectorRegistry;
}

/**
 * One long-running agent per Innovation Intelligence domain (Market/GitHub/
 * Community/Research/Workflow/Competitor from the design doc). All six
 * share this implementation rather than six near-identical classes — each
 * only differs by which domain's Collectors it runs. Swapping a domain's
 * mock collector for a real network-backed one (`CollectorRegistry.register`)
 * turns it into a live monitor without touching this class, the same
 * extension path as tools/providers.
 */
export class IntelligenceAgent extends BaseAgent {
  name: string;
  description: string;
  capabilities: string[];

  constructor(private readonly opts: IntelligenceAgentOptions) {
    super();
    this.name = `intelligence-${opts.domain}`;
    this.description = DOMAIN_DESCRIPTIONS[opts.domain];
    this.capabilities = [`intelligence:${opts.domain}`];
  }

  async run(_task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const collectors = this.opts.collectors.byDomain(this.opts.domain);
    const signals: Signal[] = [];

    for (const collector of collectors) {
      try {
        signals.push(...(await collector.collect()));
      } catch {
        // collectors are best-effort — a flaky network source shouldn't fail the whole discovery cycle
      }
    }

    for (const signal of signals) {
      context.eventBus?.emit("innovation:signal-captured", { domain: this.opts.domain, signalId: signal.id, title: signal.title });
    }

    return { ok: true, output: await this.synthesize(signals, context), data: { signals } };
  }

  private async synthesize(signals: Signal[], context: AgentContext): Promise<string> {
    if (signals.length === 0) return `No new ${this.opts.domain} signals this cycle.`;

    try {
      const { content } = await context.provider.chat(
        [
          {
            role: "system",
            content: `You are the ${this.opts.domain} intelligence agent inside AshOS. In 2-3 sentences, summarize why these signals matter and what opportunity they point to.`
          },
          { role: "user", content: signals.map((s) => `- [${s.kind}] ${s.title}: ${s.summary}`).join("\n") }
        ],
        { temperature: 0.3 }
      );
      return content;
    } catch {
      return signals.map((s) => `- ${s.title}`).join("\n");
    }
  }
}
