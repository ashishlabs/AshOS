import fs from "node:fs";
import path from "node:path";

export interface InnovationConfig {
  /** Provider name (as registered in ProviderRegistry) used for reasoning over signals, e.g. "lmstudio". */
  researchProvider: string;
  /** Model name passed through to the research provider. Never hardcoded — read from here only. */
  researchModel: string;
  /** Domains discovered each cycle, mapping 1:1 to the built-in intelligence agents. */
  domains: IntelligenceDomain[];
  /** Merge threshold (0-1): new signals within this tag-overlap distance of an existing opportunity are merged into it instead of creating a new one. */
  mergeThreshold: number;
  /** How many top opportunities the Daily Innovation Brief highlights. */
  briefSize: number;
}

export type IntelligenceDomain = "market" | "github" | "community" | "research" | "workflow" | "competitor";

/** How demanding a task is — the unit `ModelRouter` selects a provider by. Deliberately just three tiers, not a numeric score: coarse enough to configure once and forget, per `docs/model-router.md`. */
export type TaskComplexity = "simple" | "standard" | "complex";

export interface RouterConfig {
  /** Off by default — `providers.active()` (today's fixed single-provider behavior) is used unchanged unless a project explicitly opts in. */
  enabled: boolean;
  /** Provider name (as registered in ProviderRegistry) for routine, low-stakes tasks — a local/free model is the intended default once enabled. */
  simpleProvider: string;
  /** Provider name for everyday work that isn't trivial but doesn't need a frontier model. */
  standardProvider: string;
  /** Provider name for tasks that genuinely need the strongest available model. */
  complexProvider: string;
}

export interface AshOSConfig {
  provider: "anthropic" | "openai" | "ollama" | "lmstudio" | "mock";
  providers: {
    anthropic?: { apiKey?: string; model?: string };
    openai?: { apiKey?: string; model?: string };
    ollama?: { baseUrl?: string; model?: string };
    lmstudio?: { baseUrl?: string; apiKey?: string; model?: string };
  };
  plugins: string[];
  innovation: InnovationConfig;
  router: RouterConfig;
  createdAt: string;
}

export const ASHOS_DIR = ".ashos";
export const CONFIG_FILE = "config.json";

export function ashosDir(root: string = process.cwd()): string {
  return path.join(root, ASHOS_DIR);
}

export function configPath(root: string = process.cwd()): string {
  return path.join(ashosDir(root), CONFIG_FILE);
}

export function defaultConfig(): AshOSConfig {
  return {
    provider: (process.env.ASHOS_PROVIDER as AshOSConfig["provider"]) ?? "mock",
    providers: {
      anthropic: { apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5" },
      openai: { apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL ?? "gpt-4o-mini" },
      ollama: { baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434", model: process.env.OLLAMA_MODEL ?? "llama3.1" },
      lmstudio: {
        baseUrl: process.env.LMSTUDIO_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "http://localhost:1234/v1",
        apiKey: process.env.LMSTUDIO_API_KEY ?? "lm-studio",
        model: process.env.LMSTUDIO_MODEL ?? ""
      }
    },
    plugins: [],
    innovation: {
      researchProvider: process.env.ASHOS_RESEARCH_PROVIDER ?? "lmstudio",
      researchModel: process.env.ASHOS_RESEARCH_MODEL ?? "qwen/qwen2.5-coder-14b",
      domains: ["market", "github", "community", "research", "workflow", "competitor"],
      mergeThreshold: 0.5,
      briefSize: 5
    },
    router: {
      enabled: false,
      simpleProvider: "ollama",
      standardProvider: "lmstudio",
      complexProvider: "anthropic"
    },
    createdAt: new Date().toISOString()
  };
}

export function loadConfig(root: string = process.cwd()): AshOSConfig {
  const file = configPath(root);
  if (!fs.existsSync(file)) return defaultConfig();
  try {
    const onDisk = JSON.parse(fs.readFileSync(file, "utf-8")) as AshOSConfig;
    return { ...defaultConfig(), ...onDisk };
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(config: AshOSConfig, root: string = process.cwd()): void {
  fs.mkdirSync(ashosDir(root), { recursive: true });
  fs.writeFileSync(configPath(root), JSON.stringify(config, null, 2));
}

export function isInitialized(root: string = process.cwd()): boolean {
  return fs.existsSync(configPath(root));
}
