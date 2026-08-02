import { describe, expect, it } from "vitest";
import { ModelRouter, defaultComplexityForCapability } from "./router";
import { ProviderRegistry } from "./registry";
import { defaultConfig, type AshOSConfig, type RouterConfig } from "../kernel/config";

function makeRegistry(overrides: Partial<AshOSConfig> = {}): ProviderRegistry {
  return new ProviderRegistry({ ...defaultConfig(), provider: "mock", ...overrides });
}

function routerConfig(overrides: Partial<RouterConfig> = {}): RouterConfig {
  return { enabled: true, simpleProvider: "mock", standardProvider: "mock", complexProvider: "mock", ...overrides };
}

describe("ModelRouter", () => {
  it("always returns the active provider when routing is disabled", () => {
    const registry = makeRegistry();
    const router = new ModelRouter(registry, routerConfig({ enabled: false, simpleProvider: "does-not-exist" }));

    expect(router.select("simple")).toBe(registry.active());
    expect(router.select("complex")).toBe(registry.active());
  });

  it("selects the configured provider per complexity tier when enabled", () => {
    const registry = makeRegistry();
    registry.registerFactory("fast-local", () => registry.get("mock"));
    const router = new ModelRouter(registry, routerConfig({ simpleProvider: "fast-local", standardProvider: "mock", complexProvider: "mock" }));

    expect(router.select("simple").name()).toBe(registry.get("fast-local").name());
  });

  it("defaults to 'standard' complexity when none is given", () => {
    const registry = makeRegistry();
    const router = new ModelRouter(registry, routerConfig({ standardProvider: "mock" }));
    expect(router.select()).toBe(registry.get("mock"));
  });

  it("falls back to the active provider when the configured tier provider isn't registered", () => {
    const registry = makeRegistry({ provider: "mock" });
    const router = new ModelRouter(registry, routerConfig({ simpleProvider: "totally-unregistered" }));

    expect(router.select("simple")).toBe(registry.active());
  });
});

describe("defaultComplexityForCapability", () => {
  it("classifies known agent capabilities", () => {
    expect(defaultComplexityForCapability("generic")).toBe("simple");
    expect(defaultComplexityForCapability("testing")).toBe("simple");
    expect(defaultComplexityForCapability("code")).toBe("standard");
    expect(defaultComplexityForCapability("research")).toBe("standard");
  });

  it("defaults unknown or missing capabilities to 'standard'", () => {
    expect(defaultComplexityForCapability("some-future-capability")).toBe("standard");
    expect(defaultComplexityForCapability(undefined)).toBe("standard");
  });
});
