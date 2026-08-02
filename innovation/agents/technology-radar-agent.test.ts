import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TechnologyRadarAgent } from "./technology-radar-agent";
import { RadarStore } from "../radar/radar-store";
import { ToolRegistry } from "../../tools/registry";
import { MockProvider } from "../../providers/mock-provider";
import type { AgentContext } from "../../agents/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

/** Seeds the KnowledgeGraph's underlying JSON file directly — the only way to control node createdAt/updatedAt, which KnowledgeGraph.upsertNode always stamps with "now". */
function seedGraph(root: string, technologies: { label: string; weight: number; createdAt: string; updatedAt: string }[]): void {
  const graphDir = path.join(root, ".ashos", "innovation");
  fs.mkdirSync(graphDir, { recursive: true });
  const nodes = technologies.map((t, i) => ({
    id: `tech-${i}`,
    kind: "technology",
    label: t.label,
    tags: [],
    createdAt: t.createdAt,
    updatedAt: t.updatedAt
  }));
  const problemNode = { id: "problem-1", kind: "problem", label: "seed problem", tags: [], createdAt: technologies[0]?.createdAt, updatedAt: technologies[0]?.updatedAt };
  const edges = technologies.map((t, i) => ({
    id: `edge-${i}`,
    from: "problem-1",
    to: `tech-${i}`,
    kind: "relates-to",
    weight: t.weight,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt
  }));
  fs.writeFileSync(path.join(graphDir, "graph.json"), JSON.stringify({ nodes: [problemNode, ...nodes], edges }, null, 2));
}

describe("TechnologyRadarAgent", () => {
  let root: string;
  let context: AgentContext;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-radar-agent-"));
    context = { provider: new MockProvider(), tools: new ToolRegistry(), cwd: root };
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reports nothing tracked yet against an empty graph", async () => {
    const agent = new TechnologyRadarAgent();
    const result = await agent.execute({ id: "t1", description: "radar" }, context);
    expect(result.ok).toBe(true);
    expect((result.data as { entries: unknown[] }).entries).toEqual([]);
  });

  it("classifies technologies from the knowledge graph and persists them to the RadarStore", async () => {
    seedGraph(root, [
      { label: "agents", weight: 2, createdAt: daysAgo(5), updatedAt: daysAgo(1) }, // emerging
      { label: "kubernetes", weight: 60, createdAt: daysAgo(60), updatedAt: daysAgo(1) }, // growing
      { label: "cobol", weight: 20, createdAt: daysAgo(400), updatedAt: daysAgo(200) } // obsolete
    ]);

    const agent = new TechnologyRadarAgent();
    const result = await agent.execute({ id: "t2", description: "radar" }, context);

    expect(result.ok).toBe(true);
    const data = result.data as { entries: { technology: string; ring: string }[]; byRing: Record<string, number> };
    const byTech = Object.fromEntries(data.entries.map((e) => [e.technology, e.ring]));
    expect(byTech.agents).toBe("emerging");
    expect(byTech.kubernetes).toBe("growing");
    expect(byTech.cobol).toBe("obsolete");

    const store = new RadarStore(root);
    expect(store.list()).toHaveLength(3);
  });

  it("aggregates mentions across multiple edges touching the same technology node", async () => {
    const graphDir = path.join(root, ".ashos", "innovation");
    fs.mkdirSync(graphDir, { recursive: true });
    const now = daysAgo(1);
    fs.writeFileSync(
      path.join(graphDir, "graph.json"),
      JSON.stringify({
        nodes: [
          { id: "p1", kind: "problem", label: "p1", tags: [], createdAt: now, updatedAt: now },
          { id: "p2", kind: "problem", label: "p2", tags: [], createdAt: now, updatedAt: now },
          { id: "t1", kind: "technology", label: "llm", tags: [], createdAt: daysAgo(10), updatedAt: now }
        ],
        edges: [
          { id: "e1", from: "p1", to: "t1", kind: "relates-to", weight: 3, createdAt: now, updatedAt: now },
          { id: "e2", from: "p2", to: "t1", kind: "relates-to", weight: 4, createdAt: now, updatedAt: now }
        ]
      })
    );

    const agent = new TechnologyRadarAgent();
    const result = await agent.execute({ id: "t3", description: "radar" }, context);
    const data = result.data as { entries: { technology: string; evidence: { totalMentions: number } }[] };
    expect(data.entries[0].evidence.totalMentions).toBe(7);
  });
});
