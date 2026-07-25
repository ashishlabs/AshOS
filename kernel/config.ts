import fs from "node:fs";
import path from "node:path";

export interface AshOSConfig {
  provider: "anthropic" | "openai" | "ollama" | "mock";
  providers: {
    anthropic?: { apiKey?: string; model?: string };
    openai?: { apiKey?: string; model?: string };
    ollama?: { baseUrl?: string; model?: string };
  };
  plugins: string[];
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
      ollama: { baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434", model: process.env.OLLAMA_MODEL ?? "llama3.1" }
    },
    plugins: [],
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
