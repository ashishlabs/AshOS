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
});
