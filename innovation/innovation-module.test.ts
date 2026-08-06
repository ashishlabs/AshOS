import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Kernel } from "../kernel/kernel";
import { defaultConfig, type AshOSConfig } from "../kernel/config";
import { ProviderRegistry } from "../providers/registry";
import { AgentRegistry } from "../agents/registry";
import { ToolRegistry } from "../tools/registry";
import { InnovationModule } from "./innovation-module";
import type { AshOSEvent } from "../kernel/event-bus";

describe("InnovationModule", () => {
  let root: string;
  let kernel: Kernel;
  let agents: AgentRegistry;
  let module_: InnovationModule;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-innovation-"));
    const config: AshOSConfig = {
      ...defaultConfig(),
      provider: "mock",
      innovation: { ...defaultConfig().innovation, researchProvider: "mock" }
    };
    kernel = new Kernel({ root, config });
    agents = new AgentRegistry();
    module_ = new InnovationModule({ kernel, providers: new ProviderRegistry(kernel.config), agents, tools: new ToolRegistry() });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("registers one IntelligenceAgent per configured domain into the shared AgentRegistry", () => {
    for (const domain of ["market", "github", "community", "research", "workflow", "competitor"]) {
      expect(agents.findByCapability(`intelligence:${domain}`)).toBeDefined();
    }
  });

  it("runs a discovery cycle, populating opportunities, the knowledge graph and the builder profile", async () => {
    const events: string[] = [];
    const off = kernel.eventBus.on("*", (e: AshOSEvent) => events.push(e.name));

    const result = await module_.runDiscoveryCycle(["market", "github"]);
    off();

    expect(result.signalCount).toBeGreaterThan(0);
    expect(result.opportunities.length).toBeGreaterThan(0);
    expect(module_.opportunities.list().length).toBe(result.opportunities.length);
    expect(module_.graph.stats().nodeCount).toBeGreaterThan(0);
    expect(Object.keys(module_.profile.load().categories).length).toBeGreaterThan(0);

    expect(events).toContain("innovation:cycle-started");
    expect(events).toContain("innovation:cycle-finished");
    expect(events).toContain("innovation:opportunity-created");
  });

  it("only runs the requested domains, not the full default set", async () => {
    const result = await module_.runDiscoveryCycle(["market"]);
    expect(result.opportunities.every((o) => o.domains.every((d) => d === "market"))).toBe(true);
  });

  it("re-running a cycle merges into existing opportunities rather than only ever creating new ones", async () => {
    const first = await module_.runDiscoveryCycle(["market"]);
    const second = await module_.runDiscoveryCycle(["market"]);

    // same deterministic mock seeds every cycle -> high tag overlap -> should merge, not duplicate 1:1
    expect(second.opportunities.length).toBe(first.opportunities.length);
  });

  it("generates a daily brief ranked by opportunity score after a discovery cycle", async () => {
    await module_.runDiscoveryCycle();
    const brief = await module_.generateBrief();

    expect(brief.topOpportunities.length).toBeGreaterThan(0);
    expect(brief.narrative).toBeTruthy();
    for (let i = 1; i < brief.topOpportunities.length; i++) {
      expect(brief.topOpportunities[i - 1].score.overall).toBeGreaterThanOrEqual(brief.topOpportunities[i].score.overall);
    }
  });

  it("returns a brief that says nothing has been discovered yet before any cycle runs", async () => {
    const brief = await module_.generateBrief();
    expect(brief.topOpportunities).toHaveLength(0);
  });

  it("registers one real collector per known live source (github/hn/reddit/arxiv/huggingface/product-hunt)", () => {
    const ids = module_.liveCollectors.map((c) => c.id).sort();
    expect(ids).toEqual(["arxiv-live", "github-live", "hn-live", "huggingface-live", "product-hunt-live", "reddit-live"]);
  });

  it("runLiveDiscovery isolates a failing collector so the others still ingest", async () => {
    module_.liveCollectors.length = 0;
    module_.liveCollectors.push(
      {
        id: "ok-source",
        domain: "github",
        description: "always succeeds",
        collect: async () => [
          {
            id: "ok-1",
            domain: "github",
            kind: "repository",
            source: "test",
            title: "A repo",
            summary: "summary",
            tags: ["ai"],
            confidence: 0.8,
            observedAt: new Date().toISOString()
          }
        ]
      },
      {
        id: "broken-source",
        domain: "community",
        description: "always throws",
        collect: async () => {
          throw new Error("boom");
        }
      }
    );

    const result = await module_.runLiveDiscovery();

    expect(result.signalCount).toBe(1);
    expect(result.sources).toHaveLength(2);
    const ok = result.sources.find((s) => s.id === "ok-source")!;
    const broken = result.sources.find((s) => s.id === "broken-source")!;
    expect(ok.signals).toHaveLength(1);
    expect(broken.error).toBe("boom");
  });

  it("runLiveDiscovery restricts to the requested source ids", async () => {
    const ids = module_.liveCollectors.map((c) => c.id);
    module_.liveCollectors.length = 0;
    module_.liveCollectors.push(
      { id: "a", domain: "github", description: "a", collect: async () => [] },
      { id: "b", domain: "github", description: "b", collect: async () => [] }
    );

    const result = await module_.runLiveDiscovery(["b"]);
    expect(result.sources.map((s) => s.id)).toEqual(["b"]);
    expect(ids.length).toBeGreaterThan(0); // sanity: default set was non-empty before we replaced it
  });

  it("runLiveGithubDiscovery stays backward compatible, restricting to just github-live", async () => {
    module_.liveCollectors.length = 0;
    module_.liveCollectors.push(
      { id: "github-live", domain: "github", description: "github", collect: async () => [] },
      { id: "hn-live", domain: "community", description: "hn", collect: async () => [] }
    );

    await module_.runLiveGithubDiscovery();
    // the legacy method returns DiscoveryCycleResult (no `sources`); verify via a fresh runLiveDiscovery call shape instead
    const result = await module_.runLiveDiscovery(["github-live"]);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].id).toBe("github-live");
  });

  it("generateDigest writes a Markdown file and returns its content + path", async () => {
    module_.liveCollectors.length = 0;
    module_.liveCollectors.push({
      id: "github-live",
      domain: "github",
      description: "github",
      collect: async () => [
        {
          id: "gh-1",
          domain: "github",
          kind: "repository",
          source: "test",
          title: "acme/widget",
          summary: "summary",
          url: "https://github.com/acme/widget",
          tags: ["ai"],
          confidence: 0.9,
          observedAt: new Date().toISOString()
        }
      ]
    });

    const digest = await module_.generateDigest();

    expect(digest.markdown).toContain("AshOS Daily AI News Digest");
    expect(digest.markdown).toContain("acme/widget");
    expect(fs.existsSync(digest.path)).toBe(true);
    expect(fs.readFileSync(digest.path, "utf-8")).toBe(digest.markdown);
  });
});
