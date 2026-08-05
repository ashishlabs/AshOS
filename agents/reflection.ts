import type { InboxItem } from "../inbox/types";
import type { MemoryRecord } from "../memory/types";
import type { KnowledgeNode } from "../graph/types";

export type ReflectionPeriod = "daily" | "weekly" | "monthly";

const PERIOD_MS: Record<ReflectionPeriod, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000
};

export interface ReflectionFailure {
  agent: string;
  description: string;
  error?: string;
}

export interface OutcomeSummary {
  total: number;
  success: number;
  failure: number;
  failures: ReflectionFailure[];
}

export interface InboxSummary {
  captured: number;
  reviewed: number;
  archived: number;
}

export interface KnowledgeGraphSummary {
  newNodes: number;
  byKind: Record<string, number>;
}

export interface ReflectionData {
  period: ReflectionPeriod;
  windowStart: string;
  windowEnd: string;
  outcomes: OutcomeSummary;
  inbox: InboxSummary;
  knowledgeGraph: KnowledgeGraphSummary;
}

export function reflectionWindowStart(period: ReflectionPeriod, now: Date): Date {
  return new Date(now.getTime() - PERIOD_MS[period]);
}

function withinWindow(iso: string, start: Date, end: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

/** `MemoryRecord.value` shape written by `agents/outcome.ts`'s `buildOutcome()`. */
interface TaskOutcomeLike {
  agent: string;
  description: string;
  outcome: "success" | "failure";
  error?: string;
}

export function summarizeOutcomes(records: MemoryRecord[], start: Date, end: Date): OutcomeSummary {
  const outcomes = records
    .filter((r) => r.tags?.includes("outcome") && withinWindow(r.createdAt, start, end))
    .map((r) => r.value as TaskOutcomeLike);

  const failures = outcomes.filter((o) => o.outcome === "failure").map((o) => ({ agent: o.agent, description: o.description, error: o.error }));
  return { total: outcomes.length, success: outcomes.length - failures.length, failure: failures.length, failures };
}

export function summarizeInbox(items: InboxItem[], start: Date, end: Date): InboxSummary {
  const captured = items.filter((i) => withinWindow(i.createdAt, start, end));
  return {
    captured: captured.length,
    reviewed: captured.filter((i) => i.status === "reviewed").length,
    archived: captured.filter((i) => i.status === "archived").length
  };
}

export function summarizeGraph(nodes: KnowledgeNode[], start: Date, end: Date): KnowledgeGraphSummary {
  const created = nodes.filter((n) => withinWindow(n.createdAt, start, end));
  const byKind: Record<string, number> = {};
  for (const node of created) byKind[node.kind] = (byKind[node.kind] ?? 0) + 1;
  return { newNodes: created.length, byKind };
}

export function buildReflectionData(params: {
  period: ReflectionPeriod;
  outcomeRecords: MemoryRecord[];
  inboxItems: InboxItem[];
  graphNodes: KnowledgeNode[];
  now?: Date;
}): ReflectionData {
  const end = params.now ?? new Date();
  const start = reflectionWindowStart(params.period, end);
  return {
    period: params.period,
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    outcomes: summarizeOutcomes(params.outcomeRecords, start, end),
    inbox: summarizeInbox(params.inboxItems, start, end),
    knowledgeGraph: summarizeGraph(params.graphNodes, start, end)
  };
}

const PERIOD_LABEL: Record<ReflectionPeriod, string> = { daily: "today", weekly: "this week", monthly: "this month" };

export function isReflectionDataEmpty(data: ReflectionData): boolean {
  return data.outcomes.total === 0 && data.inbox.captured === 0 && data.knowledgeGraph.newNodes === 0;
}

/** Deterministic, no-LLM narrative — same "never hard-fail" role as `DailyBriefGenerator.fallbackNarrative`. */
export function fallbackNarrative(data: ReflectionData): string {
  const label = PERIOD_LABEL[data.period];
  if (isReflectionDataEmpty(data)) {
    return `Nothing recorded ${label} yet.`;
  }

  const parts: string[] = [];
  if (data.outcomes.total > 0) {
    parts.push(
      `${data.outcomes.success}/${data.outcomes.total} agent task${data.outcomes.total === 1 ? "" : "s"} succeeded ${label}` +
        (data.outcomes.failure > 0 ? `, ${data.outcomes.failure} failed` : "") +
        "."
    );
  }
  if (data.inbox.captured > 0) {
    parts.push(`${data.inbox.captured} item${data.inbox.captured === 1 ? "" : "s"} captured to the Inbox (${data.inbox.reviewed} reviewed, ${data.inbox.archived} archived).`);
  }
  if (data.knowledgeGraph.newNodes > 0) {
    parts.push(`${data.knowledgeGraph.newNodes} new knowledge graph node${data.knowledgeGraph.newNodes === 1 ? "" : "s"}.`);
  }
  return parts.join(" ");
}
