import { Command } from "commander";
import { defaultConfig, saveConfig, isInitialized, ashosDir } from "../../kernel/config";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize AshOS in the current directory (.ashos/config.json)")
    .option("-p, --provider <provider>", "default provider (anthropic|openai|ollama|mock)", "mock")
    .option("-f, --force", "overwrite existing config", false)
    .action((opts) => {
      const root = process.cwd();
      if (isInitialized(root) && !opts.force) {
        console.log(`AshOS is already initialized at ${ashosDir(root)} (use --force to overwrite)`);
        return;
      }
      const config = defaultConfig();
      config.provider = opts.provider;
      saveConfig(config, root);
      console.log(`Initialized AshOS in ${ashosDir(root)} with provider "${config.provider}"`);
    });
}
