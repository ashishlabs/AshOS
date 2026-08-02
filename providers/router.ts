import type { AIProvider } from "./types";
import type { ProviderRegistry } from "./registry";
import type { RouterConfig, TaskComplexity } from "../kernel/config";

/**
 * Default complexity for an agent that doesn't explicitly tag a task —
 * keyed by the agent's own primary capability, so no call site needs to
 * change to get a sensible default once routing is enabled. Deliberately
 * conservative: anything not listed here defaults to "standard" rather
 * than guessing simple (see `ModelRouter.select`).
 */
const DEFAULT_COMPLEXITY_BY_CAPABILITY: Record<string, TaskComplexity> = {
  generic: "simple",
  testing: "simple",
  git: "simple",
  "github-trending": "simple",
  "codebase-analyst": "simple",
  "repository-analyst": "simple",
  "technology-radar": "simple",
  code: "standard",
  research: "standard"
};

export function defaultComplexityForCapability(capability: string | undefined): TaskComplexity {
  if (!capability) return "standard";
  return DEFAULT_COMPLEXITY_BY_CAPABILITY[capability] ?? "standard";
}

/**
 * Task-aware provider selection: send routine work to a cheap/local model
 * and reserve the strongest configured provider for tasks that actually
 * need it — the "router" layer from `docs/roadmap-v2.md` Stage 2, closing
 * North Star goal #6 (Local-First AI). Off by default
 * (`RouterConfig.enabled`) — when disabled, `select()` always returns
 * `registry.active()`, so nothing behaves differently unless a project
 * explicitly opts in. See `docs/model-router.md`.
 */
export class ModelRouter {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly config: RouterConfig
  ) {}

  /**
   * Resolves the provider for one task. Falls back to `registry.active()`
   * whenever routing is disabled, or the configured provider for a tier
   * isn't actually registered (a misconfigured router should never break
   * a task that would otherwise have worked).
   */
  select(complexity: TaskComplexity = "standard"): AIProvider {
    if (!this.config.enabled) return this.registry.active();

    const providerName = {
      simple: this.config.simpleProvider,
      standard: this.config.standardProvider,
      complex: this.config.complexProvider
    }[complexity];

    if (!this.registry.list().includes(providerName)) return this.registry.active();
    return this.registry.get(providerName);
  }
}
