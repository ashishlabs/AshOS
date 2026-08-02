import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BaseAgent } from "./base-agent";
import type { AgentContext, AgentResult, AgentTask } from "./types";
import { ModelRouter } from "../providers/router";
import { ProviderRegistry } from "../providers/registry";
import { defaultConfig, type RouterConfig } from "../kernel/config";
import type { AIProvider, ChatMessage, ChatOptions, ChatResult, StreamChunk } from "../providers/types";
import { MemoryManager } from "../memory/memory-manager";

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

class FailingAgent extends BaseAgent {
  name = "failing";
  description = "always returns a failed result";
  capabilities = ["testing"];

  async run(): Promise<AgentResult> {
    return { ok: false, error: "it broke" };
  }
}

class ThrowingAgent extends BaseAgent {
  name = "throwing";
  description = "always throws";
  capabilities = ["testing"];

  async run(): Promise<AgentResult> {
    throw new Error("kaboom");
  }
}

describe("BaseAgent outcome memory", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-outcome-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function contextWithMemory(): AgentContext {
    const registry = new ProviderRegistry({ ...defaultConfig(), provider: "mock" });
    return { provider: registry.active(), tools: undefined as never, cwd: root, memory: new MemoryManager(root) };
  }

  it("does nothing when the context has no memory", async () => {
    const registry = new ProviderRegistry({ ...defaultConfig(), provider: "mock" });
    const agent = new RecordingAgent();
    await expect(agent.execute({ id: "t1", description: "d" }, { provider: registry.active(), tools: undefined as never, cwd: root })).resolves.toMatchObject({ ok: true });
  });

  it("records a successful outcome tagged with the agent name and 'success'", async () => {
    const context = contextWithMemory();
    const agent = new RecordingAgent();

    await agent.execute({ id: "t1", description: "say hi" }, context);

    const records = context.memory!.query({ tag: "outcome" });
    expect(records).toHaveLength(1);
    expect(records[0].value).toMatchObject({ agent: "recording", taskId: "t1", description: "say hi", outcome: "success" });
    expect(context.memory!.query({ tag: "recording" })).toHaveLength(1);
    expect(context.memory!.query({ tag: "success" })).toHaveLength(1);
  });

  it("records a failed outcome (agent returns ok:false) with the error message", async () => {
    const context = contextWithMemory();
    const agent = new FailingAgent();

    await agent.execute({ id: "t1", description: "d" }, context);

    const records = context.memory!.query({ tag: "outcome" });
    expect(records[0].value).toMatchObject({ outcome: "failure", error: "it broke" });
  });

  it("records a failed outcome when the agent throws", async () => {
    const context = contextWithMemory();
    const agent = new ThrowingAgent();

    const result = await agent.execute({ id: "t1", description: "d" }, context);

    expect(result).toEqual({ ok: false, error: "kaboom" });
    const records = context.memory!.query({ tag: "outcome" });
    expect(records[0].value).toMatchObject({ outcome: "failure", error: "kaboom" });
  });

  it("still returns the task result even if writing to memory fails", async () => {
    const context = contextWithMemory();
    context.memory!.remember = async () => {
      throw new Error("disk full");
    };
    const agent = new RecordingAgent();

    await expect(agent.execute({ id: "t1", description: "d" }, context)).resolves.toEqual({ ok: true });
  });

  it("gives every attempt its own record instead of overwriting the previous one", async () => {
    const context = contextWithMemory();
    const agent = new RecordingAgent();

    await agent.execute({ id: "t1", description: "attempt 1" }, context);
    await agent.execute({ id: "t1", description: "attempt 2" }, context);

    expect(context.memory!.query({ tag: "outcome" })).toHaveLength(2);
  });
});
