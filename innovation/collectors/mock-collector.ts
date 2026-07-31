import { randomUUID } from "node:crypto";
import type { IntelligenceDomain } from "../../kernel/config";
import type { Signal, SignalKind } from "../types";
import type { Collector } from "./types";

export interface MockSignalSeed {
  kind: SignalKind;
  source: string;
  title: string;
  summary: string;
  tags: string[];
  url?: string;
  confidence?: number;
}

/**
 * Deterministic, offline collector — the default for every domain, same
 * role `mock-provider.ts` plays for chat: it lets `ash innovation discover`
 * and the full test suite work with zero network access or API keys. Real
 * collectors (GitHub search API, Hacker News/Reddit JSON endpoints, arXiv
 * API, ...) implement the same `Collector` interface and register under a
 * different id via `CollectorRegistry.register` — nothing else changes.
 */
export function createMockCollector(domain: IntelligenceDomain, seeds: MockSignalSeed[]): Collector {
  return {
    id: `mock-${domain}`,
    domain,
    description: `Deterministic offline collector for the ${domain} domain (default; swap in a network-backed collector via CollectorRegistry.register).`,
    async collect(): Promise<Signal[]> {
      const observedAt = new Date().toISOString();
      return seeds.map((seed) => ({
        id: randomUUID(),
        domain,
        kind: seed.kind,
        source: seed.source,
        title: seed.title,
        summary: seed.summary,
        url: seed.url,
        tags: seed.tags,
        confidence: seed.confidence ?? 0.5,
        observedAt
      }));
    }
  };
}

/** Illustrative seed data per domain so a fresh `ash init` has something to discover immediately, offline. */
export const DEFAULT_MOCK_SEEDS: Record<IntelligenceDomain, MockSignalSeed[]> = {
  market: [
    {
      kind: "funding",
      source: "mock:market",
      title: "AI-native invoicing startup raises seed round",
      summary: "A small team automating SMB invoicing with agentic workflows raised a seed round, validating demand for AI back-office tools.",
      tags: ["fintech", "automation", "ai-agents"],
      confidence: 0.6
    },
    {
      kind: "product-launch",
      source: "mock:market",
      title: "New vertical AI agent platform launches for legal research",
      summary: "A vertical AI product targeting legal research workflows launched with strong early traction, underserving other regulated verticals.",
      tags: ["legal-tech", "vertical-ai", "agents"],
      confidence: 0.55
    }
  ],
  github: [
    {
      kind: "repository",
      source: "mock:github",
      title: "Fast-growing repo: local-first agent orchestration framework",
      summary: "A small orchestration framework for local-first AI agents is trending, with many open issues requesting a plugin marketplace.",
      tags: ["developer-tools", "agents", "open-source"],
      confidence: 0.6
    },
    {
      kind: "feature-request",
      source: "mock:github",
      title: "Repeated feature request: first-class evaluation harness for agent workflows",
      summary: "Multiple popular agent frameworks have open issues asking for a standard way to evaluate and regression-test agent behavior.",
      tags: ["developer-tools", "testing", "agents"],
      confidence: 0.5
    }
  ],
  community: [
    {
      kind: "complaint",
      source: "mock:community",
      title: "Developers complain about brittle prompt-testing workflows",
      summary: "Recurring complaints across forums about the lack of good tooling for regression-testing prompts across model upgrades.",
      tags: ["developer-tools", "testing", "llm"],
      confidence: 0.5
    },
    {
      kind: "question",
      source: "mock:community",
      title: "Repeated question: how to give an AI agent long-term memory cheaply",
      summary: "A recurring question across communities about affordable, self-hosted long-term memory for AI agents outside of vendor lock-in.",
      tags: ["memory", "agents", "self-hosted"],
      confidence: 0.45
    }
  ],
  research: [
    {
      kind: "model-release",
      source: "mock:research",
      title: "New small open-weight model reaches strong coding benchmark scores",
      summary: "A newly released small open-weight model now scores competitively on coding benchmarks, making local-first coding agents newly practical.",
      tags: ["local-ai", "code-generation", "open-weight"],
      confidence: 0.6
    },
    {
      kind: "paper",
      source: "mock:research",
      title: "Paper shows cheap technique for agent self-evaluation",
      summary: "A recent paper describes a lightweight self-evaluation technique for agent trajectories, applicable to production agent monitoring.",
      tags: ["research", "agents", "evaluation"],
      confidence: 0.5
    }
  ],
  workflow: [
    {
      kind: "workflow-friction",
      source: "mock:workflow",
      title: "Recruiters spend hours manually screening resumes against job descriptions",
      summary: "Observed manual, repetitive resume-to-job-description matching work that is a strong fit for an AI-assisted (not fully automated) workflow.",
      tags: ["recruiting", "automation", "workflow"],
      confidence: 0.5
    },
    {
      kind: "workflow-friction",
      source: "mock:workflow",
      title: "Accountants re-key the same data between spreadsheets and invoicing tools",
      summary: "Manual re-keying of financial data between disconnected tools is a common, automatable bottleneck for small accounting practices.",
      tags: ["accounting", "automation", "integrations"],
      confidence: 0.5
    }
  ],
  competitor: [
    {
      kind: "competitor-change",
      source: "mock:competitor",
      title: "Established SaaS competitor removes its free tier",
      summary: "A widely-used competitor removed its free tier, opening a window for a lightweight, open-source-friendly alternative.",
      tags: ["saas", "pricing", "open-source"],
      confidence: 0.55
    },
    {
      kind: "competitor-change",
      source: "mock:competitor",
      title: "Competitor reviews repeatedly cite missing integrations",
      summary: "Public reviews of a category-leading competitor repeatedly cite the same handful of missing integrations as a reason for churn.",
      tags: ["integrations", "reviews", "gap"],
      confidence: 0.5
    }
  ]
};
