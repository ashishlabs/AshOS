import { Command } from "commander";
import { AshOS } from "../../sdk/ashos";

export function registerProviderCommand(program: Command): void {
  const cmd = program.command("provider").description("Manage AI providers");

  cmd
    .command("list")
    .description("List available providers")
    .action(() => {
      const ashos = new AshOS();
      const active = ashos.providers.active().name();
      for (const name of ashos.providers.list()) {
        console.log(`${name === active ? "* " : "  "}${name}`);
      }
    });

  cmd
    .command("set <name>")
    .description("Set the active provider (updates .ashos/config.json)")
    .action((name: string) => {
      const ashos = new AshOS();
      if (!ashos.providers.list().includes(name)) {
        console.error(`Unknown provider "${name}". Available: ${ashos.providers.list().join(", ")}`);
        process.exitCode = 1;
        return;
      }
      ashos.kernel.updateConfig({ provider: name as never });
      console.log(`Active provider set to "${name}"`);
    });
}
