import { describe, expect, it } from "vitest";
import { buildMarkdownDigest } from "./markdown-digest";
import type { LiveSourceResult } from "../innovation-module";
import type { Opportunity, Signal } from "../types";

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "sig-1",
    domain: "github",
    kind: "repository",
    source: "github:search-api",
    title: "acme/widget",
    summary: "A widget framework.",
    url: "https://github.com/acme/widget",
    tags: ["ai"],
    confidence: 0.8,
    observedAt: "2026-08-02T09:00:00Z",
    ...overrides
  };
}

function opportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "opp-1",
    title: "Build a widget",
    problemStatement: "Widgets are hard to build.",
    tags: ["ai"],
    domains: ["github"],
    signals: [],
    score: {
      marketDemand: 0.5,
      competition: 0.5,
      revenuePotential: 0.5,
      automationPotential: 0.5,
      aiAdvantage: 0.5,
      technicalDifficulty: 0.5,
      buildTime: 0.5,
      distributionPotential: 0.5,
      openSourcePotential: 0.5,
      virality: 0.5,
      communityInterest: 0.5,
      strategicAlignment: 0.5,
      personalFit: 0.5,
      futureGrowth: 0.5,
      confidence: 0.5,
      overall: 0.72
    },
    stage: "captured",
    createdAt: "2026-08-02T09:00:00Z",
    updatedAt: "2026-08-02T09:00:00Z",
    history: [],
    ...overrides
  };
}

describe("buildMarkdownDigest", () => {
  it("renders a header, per-source sections, and links for each signal", () => {
    const sources: LiveSourceResult[] = [{ id: "github-live", domain: "github", description: "GitHub", signals: [signal()] }];

    const markdown = buildMarkdownDigest({ generatedAt: "2026-08-02T09:00:00Z", sources, topOpportunities: [] });

    expect(markdown).toContain("# AshOS Daily AI News Digest — 2026-08-02");
    expect(markdown).toContain("## GitHub (github-live)");
    expect(markdown).toContain("[acme/widget](https://github.com/acme/widget)");
  });

  it("renders an honest 'no new items' line for a source with zero signals", () => {
    const sources: LiveSourceResult[] = [{ id: "hn-live", domain: "community", description: "HN", signals: [] }];

    const markdown = buildMarkdownDigest({ generatedAt: "2026-08-02T09:00:00Z", sources, topOpportunities: [] });

    expect(markdown).toContain("## Hacker News (hn-live)");
    expect(markdown).toContain("No new items in this run.");
  });

  it("surfaces a source-level error instead of silently omitting it", () => {
    const sources: LiveSourceResult[] = [{ id: "reddit-live", domain: "community", description: "Reddit", signals: [], error: "network down" }];

    const markdown = buildMarkdownDigest({ generatedAt: "2026-08-02T09:00:00Z", sources, topOpportunities: [] });

    expect(markdown).toContain("⚠️ Unavailable this run: network down");
    expect(markdown).toContain("1 source(s) unavailable this run.");
  });

  it("falls back to the collector id as a label when it has no friendly name", () => {
    const sources: LiveSourceResult[] = [{ id: "some-new-source", domain: "market", description: "New source", signals: [] }];

    const markdown = buildMarkdownDigest({ generatedAt: "2026-08-02T09:00:00Z", sources, topOpportunities: [] });

    expect(markdown).toContain("## some-new-source (some-new-source)");
  });

  it("appends a notable-opportunities section when opportunities are passed", () => {
    const markdown = buildMarkdownDigest({ generatedAt: "2026-08-02T09:00:00Z", sources: [], topOpportunities: [opportunity()] });

    expect(markdown).toContain("## Notable opportunities so far");
    expect(markdown).toContain("Build a widget");
    expect(markdown).toContain("0.72");
  });

  it("omits the opportunities section entirely when there are none", () => {
    const markdown = buildMarkdownDigest({ generatedAt: "2026-08-02T09:00:00Z", sources: [], topOpportunities: [] });

    expect(markdown).not.toContain("Notable opportunities");
  });
});
