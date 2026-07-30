import { describe, expect, it } from "vitest";
import { ProviderRegistry } from "./registry";
import { defaultConfig } from "../kernel/config";

describe("ProviderRegistry", () => {
  it("defaults to the mock provider and resolves chat calls", async () => {
    const registry = new ProviderRegistry({ ...defaultConfig(), provider: "mock" });
    const provider = registry.active();
    expect(provider.name()).toBe("mock");
    const result = await provider.chat([{ role: "user", content: "hello" }]);
    expect(result.content).toContain("hello");
  });

  it("caches provider instances", () => {
    const registry = new ProviderRegistry({ ...defaultConfig(), provider: "mock" });
    expect(registry.get("mock")).toBe(registry.get("mock"));
  });

  it("registers lmstudio alongside the other built-in providers", () => {
    const registry = new ProviderRegistry(defaultConfig());
    expect(registry.list()).toEqual(expect.arrayContaining(["mock", "anthropic", "openai", "ollama", "lmstudio"]));
    expect(registry.get("lmstudio").name()).toBe("lmstudio");
  });

  it("throws for unknown providers", () => {
    const registry = new ProviderRegistry(defaultConfig());
    expect(() => registry.get("does-not-exist")).toThrow(/unknown provider/);
  });

  it("supports registering additional providers via plugins", () => {
    const registry = new ProviderRegistry(defaultConfig());
    registry.registerFactory("custom", () => ({
      name: () => "custom",
      chat: async () => ({ content: "" }),
      stream: async function* () {
        yield { delta: "", done: true };
      },
      embeddings: async () => [],
      functionCalling: () => false,
      maxContext: () => 1000,
      supportsVision: () => false
    }));
    expect(registry.get("custom").name()).toBe("custom");
  });
});
