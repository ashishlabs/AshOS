import { describe, expect, it } from "vitest";
import {
  buildReflectionData,
  fallbackNarrative,
  isReflectionDataEmpty,
  reflectionWindowStart,
  summarizeGraph,
  summarizeInbox,
  summarizeOutcomes
} from "./reflection";
import type { InboxItem } from "../inbox/types";
import type { MemoryRecord } from "../memory/types";
import type { KnowledgeNode } from "../graph/types";

const NOW = new Date("2026-08-05T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function outcomeRecord(overrides: Partial<{ agent: string; description: string; outcome: "success" | "failure"; error?: string; createdAt: string; tags: string[] }> = {}): MemoryRecord {
  return {
    id: `rec-${Math.random()}`,
    scope: "project",
    key: `outcome:${Math.random()}`,
    value: { agent: overrides.agent ?? "code", description: overrides.description ?? "did something", outcome: overrides.outcome ?? "success", error: overrides.error },
    tags: overrides.tags ?? ["outcome", overrides.agent ?? "code", overrides.outcome ?? "success"],
    createdAt: overrides.createdAt ?? NOW.toISOString()
  };
}

function inboxItem(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: `item-${Math.random()}`,
    content: "some content",
    sourceType: "text",
    status: "unread",
    tags: [],
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides
  };
}

function graphNode(overrides: Partial<KnowledgeNode> = {}): KnowledgeNode {
  return {
    id: `node-${Math.random()}`,
    kind: "task",
    label: "some task",
    tags: [],
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides
  };
}

describe("reflectionWindowStart", () => {
  it("computes the correct window for each period", () => {
    expect(reflectionWindowStart("daily", NOW).getTime()).toBe(NOW.getTime() - DAY);
    expect(reflectionWindowStart("weekly", NOW).getTime()).toBe(NOW.getTime() - 7 * DAY);
    expect(reflectionWindowStart("monthly", NOW).getTime()).toBe(NOW.getTime() - 30 * DAY);
  });
});

describe("summarizeOutcomes", () => {
  const start = reflectionWindowStart("daily", NOW);

  it("counts success/failure within the window and lists failures", () => {
    const records = [
      outcomeRecord({ outcome: "success", createdAt: new Date(NOW.getTime() - HOUR).toISOString() }),
      outcomeRecord({ outcome: "failure", agent: "code", description: "broke the build", error: "TS error", createdAt: new Date(NOW.getTime() - 2 * HOUR).toISOString() })
    ];
    const summary = summarizeOutcomes(records, start, NOW);
    expect(summary).toEqual({ total: 2, success: 1, failure: 1, failures: [{ agent: "code", description: "broke the build", error: "TS error" }] });
  });

  it("excludes records outside the window", () => {
    const records = [outcomeRecord({ createdAt: new Date(NOW.getTime() - 2 * DAY).toISOString() })];
    expect(summarizeOutcomes(records, start, NOW).total).toBe(0);
  });

  it("excludes records without the outcome tag", () => {
    const records = [outcomeRecord({ tags: ["something-else"] })];
    expect(summarizeOutcomes(records, start, NOW).total).toBe(0);
  });
});

describe("summarizeInbox", () => {
  const start = reflectionWindowStart("daily", NOW);

  it("counts captured/reviewed/archived within the window", () => {
    const items = [
      inboxItem({ status: "unread", createdAt: new Date(NOW.getTime() - HOUR).toISOString() }),
      inboxItem({ status: "reviewed", createdAt: new Date(NOW.getTime() - HOUR).toISOString() }),
      inboxItem({ status: "archived", createdAt: new Date(NOW.getTime() - HOUR).toISOString() }),
      inboxItem({ status: "reviewed", createdAt: new Date(NOW.getTime() - 2 * DAY).toISOString() }) // outside window
    ];
    expect(summarizeInbox(items, start, NOW)).toEqual({ captured: 3, reviewed: 1, archived: 1 });
  });
});

describe("summarizeGraph", () => {
  const start = reflectionWindowStart("daily", NOW);

  it("counts new nodes by kind within the window", () => {
    const nodes = [
      graphNode({ kind: "task", createdAt: new Date(NOW.getTime() - HOUR).toISOString() }),
      graphNode({ kind: "task", createdAt: new Date(NOW.getTime() - HOUR).toISOString() }),
      graphNode({ kind: "project", createdAt: new Date(NOW.getTime() - HOUR).toISOString() }),
      graphNode({ kind: "project", createdAt: new Date(NOW.getTime() - 2 * DAY).toISOString() }) // outside window
    ];
    expect(summarizeGraph(nodes, start, NOW)).toEqual({ newNodes: 3, byKind: { task: 2, project: 1 } });
  });
});

describe("buildReflectionData", () => {
  it("composes all three summaries for the requested period", () => {
    const data = buildReflectionData({
      period: "weekly",
      outcomeRecords: [outcomeRecord()],
      inboxItems: [inboxItem()],
      graphNodes: [graphNode()],
      now: NOW
    });
    expect(data.period).toBe("weekly");
    expect(data.windowEnd).toBe(NOW.toISOString());
    expect(data.windowStart).toBe(reflectionWindowStart("weekly", NOW).toISOString());
    expect(data.outcomes.total).toBe(1);
    expect(data.inbox.captured).toBe(1);
    expect(data.knowledgeGraph.newNodes).toBe(1);
  });
});

describe("isReflectionDataEmpty / fallbackNarrative", () => {
  it("reports empty when nothing happened", () => {
    const data = buildReflectionData({ period: "daily", outcomeRecords: [], inboxItems: [], graphNodes: [], now: NOW });
    expect(isReflectionDataEmpty(data)).toBe(true);
    expect(fallbackNarrative(data)).toBe("Nothing recorded today yet.");
  });

  it("summarizes activity deterministically without an LLM", () => {
    const data = buildReflectionData({
      period: "daily",
      outcomeRecords: [outcomeRecord({ outcome: "success" }), outcomeRecord({ outcome: "failure" })],
      inboxItems: [inboxItem({ status: "reviewed" })],
      graphNodes: [graphNode()],
      now: NOW
    });
    expect(isReflectionDataEmpty(data)).toBe(false);
    const narrative = fallbackNarrative(data);
    expect(narrative).toContain("1/2 agent tasks succeeded today, 1 failed.");
    expect(narrative).toContain("1 item captured to the Inbox (1 reviewed, 0 archived).");
    expect(narrative).toContain("1 new knowledge graph node.");
  });
});
