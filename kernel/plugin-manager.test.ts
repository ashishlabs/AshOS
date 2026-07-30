import { describe, expect, it } from "vitest";
import path from "node:path";
import { PluginManager } from "./plugin-manager";
import { ToolRegistry } from "../tools/registry";
import { AgentRegistry } from "../agents/registry";
import { ProviderRegistry } from "../providers/registry";
import { MutationRegistry } from "../evolution/mutation/registry";
import { BenchmarkRegistry } from "../evolution/benchmark/registry";
import { Kernel } from "./kernel";
import { defaultConfig } from "./config";

function evolutionHost() {
  return { mutations: new MutationRegistry(), benchmarks: new BenchmarkRegistry() };
}

describe("PluginManager", () => {
  it("loads the reference git plugin from the plugins directory", async () => {
    const kernel = new Kernel({ config: defaultConfig() });
    const tools = new ToolRegistry();
    const agents = new AgentRegistry();
    const providers = new ProviderRegistry(kernel.config);
    const manager = new PluginManager();

    const loaded = await manager.loadFromDirectory(path.join(process.cwd(), "plugins"), {
      kernel,
      tools,
      agents,
      providers,
      evolution: evolutionHost()
    });

    expect(loaded).toContain("git");
    expect(tools.get("git")).toBeDefined();
    expect(agents.get("git")).toBeDefined();
  });

  it("returns an empty list for a missing directory", async () => {
    const kernel = new Kernel({ config: defaultConfig() });
    const manager = new PluginManager();
    const loaded = await manager.loadFromDirectory("/does/not/exist", {
      kernel,
      tools: new ToolRegistry(),
      agents: new AgentRegistry(),
      providers: new ProviderRegistry(kernel.config),
      evolution: evolutionHost()
    });
    expect(loaded).toEqual([]);
  });

  it("loads a reference evolution plugin contributing a mutation and a benchmark", async () => {
    const kernel = new Kernel({ config: defaultConfig() });
    const evolution = evolutionHost();
    const manager = new PluginManager();

    const loaded = await manager.loadFromDirectory(path.join(process.cwd(), "evolution", "plugins"), {
      kernel,
      tools: new ToolRegistry(),
      agents: new AgentRegistry(),
      providers: new ProviderRegistry(kernel.config),
      evolution
    });

    expect(loaded).toContain("evolution-extras");
    expect(evolution.mutations.get("comment-strip")).toBeDefined();
    expect(evolution.benchmarks.get("documentation-summary")).toBeDefined();
  });
});
