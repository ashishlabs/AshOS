import { describe, expect, it } from "vitest";
import { BaseAgent } from "./base-agent";
import type { AgentContext, AgentResult, AgentTask } from "./types";
import { ModelRouter } from "../providers/router";
import { ProviderRegistry } from "../providers/registry";
import { defaultConfig, type RouterConfig } from "../kernel/config";
import type { AIProvider, ChatMessage, ChatOptions, ChatResult, StreamChunk } from "../providers/types";

function fakeProvider(id: string): AIProvider {
  return {
    name: () => id,
    async chat(_messages: ChatMessage[], _options?: ChatOptions): Promise<ChatResult> {
      return { content: id };
    },
    async *stream(_messages: ChatMessage[], _options?: ChatOptions): AsyncGenerator<StreamChunk> {
      yield { delta: id, done: true };
    },
    async embeddings(): Promise<number[]> {
      return [];
    },
    functionCalling: () => false,
    maxContext: () => 1000,
    supportsVision: () => false
  };
}

class RecordingAgent extends BaseAgent {
  name = "recording";
  description = "records the provider it received";
  capabilities = ["generic"];
  receivedProviderName = "";

  async run(_task: AgentTask, context: AgentContext): Promise<AgentResult> {
    this.receivedProviderName = context.provider.name();
    return { ok: true };
  }
}

function makeRegistryWithFakes(): ProviderRegistry {
  const registry = new ProviderRegistry({ ...defaultConfig(), provider: "active-provider" as never });
  registry.registerFactory("active-provider", () => fakeProvider("active-provider"));
  registry.registerFactory("simple-provider", () => fakeProvider("simple-provider"));
  registry.registerFactory("complex-provider", () => fakeProvider("complex-provider"));
  return registry;
}

function baseContext(registry: ProviderRegistry, router?: ModelRouter): AgentContext {
  return { provider: registry.active(), tools: undefined as never, cwd: "/tmp", router };
}

describe("BaseAgent routing", () => {
  it("uses context.provider unchanged when no router is present", async () => {
    const registry = makeRegistryWithFakes();
    const agent = new RecordingAgent();

    await agent.execute({ id: "t1", description: "d" }, baseContext(registry));
    expect(agent.receivedProviderName).toBe("active-provider");
  });

  it("uses context.provider unchanged when the router exists but is disabled", async () => {
    const registry = makeRegistryWithFakes();
    const router = new ModelRouter(registry, { enabled: false, simpleProvider: "simple-provider", standardProvider: "active-provider", complexProvider: "complex-provider" });
    const agent = new RecordingAgent();

    await agent.execute({ id: "t1", description: "d" }, baseContext(registry, router));
    expect(agent.receivedProviderName).toBe("active-provider");
  });

  it("routes to the agent's default complexity tier when the router is enabled", async () => {
    const registry = makeRegistryWithFakes();
    const routerConfig: RouterConfig = { enabled: true, simpleProvider: "simple-provider", standardProvider: "active-provider", complexProvider: "complex-provider" };
    const router = new ModelRouter(registry, routerConfig);
    const agent = new RecordingAgent(); // capability "generic" -> default complexity "simple"

    await agent.execute({ id: "t1", description: "d" }, baseContext(registry, router));
    expect(agent.receivedProviderName).toBe("simple-provider");
  });

  it("an explicit task.complexity overrides the agent's capability-based default", async () => {
    const registry = makeRegistryWithFakes();
    const routerConfig: RouterConfig = { enabled: true, simpleProvider: "simple-provider", standardProvider: "active-provider", complexProvider: "complex-provider" };
    const router = new ModelRouter(registry, routerConfig);
    const agent = new RecordingAgent();

    await agent.execute({ id: "t1", description: "d", complexity: "complex" }, baseContext(registry, router));
    expect(agent.receivedProviderName).toBe("complex-provider");
  });

  it("does not mutate the original context object", async () => {
    const registry = makeRegistryWithFakes();
    const router = new ModelRouter(registry, { enabled: true, simpleProvider: "simple-provider", standardProvider: "active-provider", complexProvider: "complex-provider" });
    const agent = new RecordingAgent();
    const context = baseContext(registry, router);

    await agent.execute({ id: "t1", description: "d" }, context);
    expect(context.provider.name()).toBe("active-provider");
  });
});
