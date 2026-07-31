import { describe, expect, it } from "vitest";
import path from "node:path";
import { PluginManager } from "./plugin-manager";
import { ToolRegistry } from "../tools/registry";
import { AgentRegistry } from "../agents/registry";
import { ProviderRegistry } from "../providers/registry";
import { CollectorRegistry } from "../innovation/collectors/registry";
import { Kernel } from "./kernel";
import { defaultConfig } from "./config";

function innovationHost() {
  return { collectors: new CollectorRegistry() };
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
      innovation: innovationHost()
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
      innovation: innovationHost()
    });
    expect(loaded).toEqual([]);
  });
});
