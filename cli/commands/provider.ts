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

  const router = cmd.command("router").description("Task-aware provider selection: route routine work to a cheap/local model, escalate only when needed");

  router
    .command("status")
    .description("Show the router's current configuration")
    .action(() => {
      const ashos = new AshOS();
      const { enabled, simpleProvider, standardProvider, complexProvider } = ashos.kernel.config.router;
      console.log(`Router: ${enabled ? "enabled" : "disabled"}`);
      console.log(`  simple   -> ${simpleProvider}`);
      console.log(`  standard -> ${standardProvider}`);
      console.log(`  complex  -> ${complexProvider}`);
    });

  router
    .command("enable")
    .description("Enable task-aware provider routing")
    .action(() => {
      const ashos = new AshOS();
      ashos.kernel.updateConfig({ router: { ...ashos.kernel.config.router, enabled: true } });
      console.log("Router enabled.");
    });

  router
    .command("disable")
    .description("Disable routing — every task uses the active provider, same as before routing existed")
    .action(() => {
      const ashos = new AshOS();
      ashos.kernel.updateConfig({ router: { ...ashos.kernel.config.router, enabled: false } });
      console.log("Router disabled.");
    });

  router
    .command("set <tier> <name>")
    .description('Set which provider handles a tier: "simple", "standard", or "complex"')
    .action((tier: string, name: string) => {
      const ashos = new AshOS();
      if (!["simple", "standard", "complex"].includes(tier)) {
        console.error(`Unknown tier "${tier}". Expected one of: simple, standard, complex.`);
        process.exitCode = 1;
        return;
      }
      if (!ashos.providers.list().includes(name)) {
        console.error(`Unknown provider "${name}". Available: ${ashos.providers.list().join(", ")}`);
        process.exitCode = 1;
        return;
      }
      const key = `${tier}Provider` as "simpleProvider" | "standardProvider" | "complexProvider";
      ashos.kernel.updateConfig({ router: { ...ashos.kernel.config.router, [key]: name } });
      console.log(`Router's "${tier}" tier set to "${name}".`);
    });
}
