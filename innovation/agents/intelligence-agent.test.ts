import { describe, expect, it } from "vitest";
import { IntelligenceAgent } from "./intelligence-agent";
import { CollectorRegistry } from "../collectors/registry";
import { createMockCollector, DEFAULT_MOCK_SEEDS } from "../collectors/mock-collector";
import { MockProvider } from "../../providers/mock-provider";
import { EventBus } from "../../kernel/event-bus";
import { ToolRegistry } from "../../tools/registry";
import type { AgentContext } from "../../agents/types";
import type { AIProvider } from "../../providers/types";

class ThrowingProvider implements AIProvider {
  name(): string {
    return "throwing";
  }
  async chat(): Promise<never> {
    throw new Error("provider down");
  }
  async *stream(): AsyncGenerator<{ delta: string; done: boolean }> {
    throw new Error("provider down");
  }
  async embeddings(): Promise<number[]> {
    return [];
  }
  functionCalling(): boolean {
    return false;
  }
  maxContext(): number {
    return 0;
  }
  supportsVision(): boolean {
    return false;
  }
}

function buildContext(eventBus?: EventBus): AgentContext {
  return { provider: new MockProvider(), tools: new ToolRegistry(), eventBus, cwd: process.cwd() };
}

describe("IntelligenceAgent", () => {
  it("tags itself with intelligence:<domain> as its only capability", () => {
    const agent = new IntelligenceAgent({ domain: "github", collectors: new CollectorRegistry() });
    expect(agent.capabilities).toEqual(["intelligence:github"]);
    expect(agent.name).toBe("intelligence-github");
  });

  it("collects signals from every registered collector for its domain and emits one signal-captured event each", async () => {
    const collectors = new CollectorRegistry();
    collectors.register(createMockCollector("market", DEFAULT_MOCK_SEEDS.market));
    collectors.register(createMockCollector("github", DEFAULT_MOCK_SEEDS.github));

    const eventBus = new EventBus();
    const captured: string[] = [];
    eventBus.on("innovation:signal-captured", (e) => captured.push((e.payload as { signalId: string }).signalId));

    const agent = new IntelligenceAgent({ domain: "market", collectors });
    const result = await agent.execute({ id: "t1", description: "discover" }, buildContext(eventBus));

    expect(result.ok).toBe(true);
    const signals = (result.data as { signals: { id: string }[] }).signals;
    expect(signals).toHaveLength(DEFAULT_MOCK_SEEDS.market.length);
    expect(captured).toHaveLength(DEFAULT_MOCK_SEEDS.market.length);
  });

  it("ignores collectors registered under a different domain", async () => {
    const collectors = new CollectorRegistry();
    collectors.register(createMockCollector("github", DEFAULT_MOCK_SEEDS.github));

    const agent = new IntelligenceAgent({ domain: "market", collectors });
    const result = await agent.execute({ id: "t1", description: "discover" }, buildContext());

    expect((result.data as { signals: unknown[] }).signals).toHaveLength(0);
    expect(result.output).toMatch(/no new market signals/i);
  });

  it("falls back to a plain bullet list if the provider throws while synthesizing", async () => {
    const collectors = new CollectorRegistry();
    collectors.register(createMockCollector("research", DEFAULT_MOCK_SEEDS.research));

    const agent = new IntelligenceAgent({ domain: "research", collectors });
    const throwingContext: AgentContext = { provider: new ThrowingProvider(), tools: new ToolRegistry(), cwd: process.cwd() };

    const result = await agent.execute({ id: "t1", description: "discover" }, throwingContext);
    expect(result.ok).toBe(true);
    expect(result.output).toContain(DEFAULT_MOCK_SEEDS.research[0].title);
  });
});
