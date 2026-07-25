import type { AIProvider } from "./types";
import { MockProvider } from "./mock-provider";
import { AnthropicProvider } from "./anthropic-provider";
import { OpenAIProvider } from "./openai-provider";
import { OllamaProvider } from "./ollama-provider";
import type { AshOSConfig } from "../kernel/config";

/**
 * Resolves the active AIProvider from config/env. Switching providers is a
 * one-line config change (`provider` in .ashos/config.json or
 * ASHOS_PROVIDER env var) — nothing else in the system references a
 * concrete provider class directly.
 */
export class ProviderRegistry {
  private factories = new Map<string, () => AIProvider>();
  private instances = new Map<string, AIProvider>();

  constructor(private config: AshOSConfig) {
    this.factories.set("mock", () => new MockProvider());
    this.factories.set(
      "anthropic",
      () =>
        new AnthropicProvider({
          apiKey: config.providers.anthropic?.apiKey ?? "",
          model: config.providers.anthropic?.model
        })
    );
    this.factories.set(
      "openai",
      () =>
        new OpenAIProvider({
          apiKey: config.providers.openai?.apiKey ?? "",
          model: config.providers.openai?.model
        })
    );
    this.factories.set(
      "ollama",
      () =>
        new OllamaProvider({
          baseUrl: config.providers.ollama?.baseUrl,
          model: config.providers.ollama?.model
        })
    );
  }

  /** Allows plugins to contribute additional providers, e.g. Groq, OpenRouter. */
  registerFactory(name: string, factory: () => AIProvider): void {
    this.factories.set(name, factory);
  }

  list(): string[] {
    return [...this.factories.keys()];
  }

  get(name: string = this.config.provider): AIProvider {
    if (!this.instances.has(name)) {
      const factory = this.factories.get(name);
      if (!factory) throw new Error(`ProviderRegistry: unknown provider "${name}"`);
      this.instances.set(name, factory());
    }
    return this.instances.get(name)!;
  }

  active(): AIProvider {
    return this.get(this.config.provider);
  }
}
