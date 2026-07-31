import type { IntelligenceDomain } from "../kernel/config";

export type SignalKind =
  | "startup"
  | "funding"
  | "product-launch"
  | "acquisition"
  | "repository"
  | "issue"
  | "feature-request"
  | "complaint"
  | "question"
  | "discussion"
  | "paper"
  | "model-release"
  | "benchmark"
  | "workflow-friction"
  | "competitor-change";

/** One raw observation captured by a collector, before it's merged into an Opportunity. */
export interface Signal {
  id: string;
  domain: IntelligenceDomain;
  kind: SignalKind;
  source: string;
  title: string;
  summary: string;
  url?: string;
  tags: string[];
  /** 0-1, how much a collector trusts this observation. */
  confidence: number;
  observedAt: string;
  raw?: unknown;
}

export type KnowledgeNodeKind =
  | "person"
  | "company"
  | "repository"
  | "product"
  | "idea"
  | "problem"
  | "industry"
  | "technology"
  | "community"
  | "language"
  | "framework"
  | "market"
  | "startup"
  | "paper"
  | "workflow"
  | "agent"
  | "project"
  | "skill"
  | "tool";

export interface KnowledgeNode {
  id: string;
  kind: KnowledgeNodeKind;
  label: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  data?: Record<string, unknown>;
}

export type KnowledgeEdgeKind = "relates-to" | "produced-by" | "competes-with" | "part-of" | "mentions" | "solves";

export interface KnowledgeEdge {
  id: string;
  from: string;
  to: string;
  kind: KnowledgeEdgeKind;
  /** Strengthens every time the same edge is observed again. */
  weight: number;
  createdAt: string;
  updatedAt: string;
}

/** See docs/innovation.md#idea-lifecycle for the allowed transition graph. */
export type IdeaLifecycleStage =
  | "captured"
  | "validated"
  | "growing"
  | "researching"
  | "planning"
  | "building"
  | "testing"
  | "released"
  | "archived"
  | "revived";

export const OPPORTUNITY_SCORE_DIMENSIONS = [
  "marketDemand",
  "competition",
  "revenuePotential",
  "automationPotential",
  "aiAdvantage",
  "technicalDifficulty",
  "buildTime",
  "distributionPotential",
  "openSourcePotential",
  "virality",
  "communityInterest",
  "strategicAlignment",
  "personalFit",
  "futureGrowth",
  "confidence"
] as const;

export type OpportunityScoreDimension = (typeof OPPORTUNITY_SCORE_DIMENSIONS)[number];

/** Every dimension is 0-1. `competition`, `technicalDifficulty` and `buildTime` are cost-like (lower is better) — ScoringEngine inverts them when computing `overall`. */
export type OpportunityScore = Record<OpportunityScoreDimension, number> & { overall: number };

export interface OpportunityHistoryEntry {
  at: string;
  event: string;
}

export interface Opportunity {
  id: string;
  title: string;
  problemStatement: string;
  tags: string[];
  domains: IntelligenceDomain[];
  /** Supporting evidence — every Signal merged into this opportunity so far, evidence-complete rather than a pointer into a separate store. */
  signals: Signal[];
  score: OpportunityScore;
  stage: IdeaLifecycleStage;
  createdAt: string;
  updatedAt: string;
  history: OpportunityHistoryEntry[];
}

export interface BuilderProfileEntry {
  category: string;
  weight: number;
  signalCount: number;
}

export interface BuilderProfile {
  updatedAt: string;
  categories: Record<string, BuilderProfileEntry>;
}

export interface DailyBrief {
  generatedAt: string;
  topOpportunities: Opportunity[];
  newSignalCount: number;
  domainsCovered: IntelligenceDomain[];
  narrative: string;
}
