import path from "node:path";
import { Command } from "commander";
import { AshOS } from "../../sdk/ashos";

export function registerPluginCommand(program: Command): void {
  const cmd = program.command("plugin").description("Manage AshOS plugins");

  cmd
    .command("list")
    .description("List loaded plugins")
    .action(async () => {
      const ashos = new AshOS();
      await ashos.loadPlugins();
      const plugins = ashos.kernel.plugins.list();
      if (plugins.length === 0) {
        console.log("No plugins loaded. Add one under ./plugins/<name>/ with a manifest.json.");
        return;
      }
      for (const p of plugins) console.log(`${p.manifest.name}@${p.manifest.version} — ${p.manifest.description ?? ""}`);
    });

  cmd
    .command("install <name>")
    .description("Load a plugin from ./plugins/<name> (local-first; registry install is on the roadmap)")
    .action(async (name: string) => {
      const ashos = new AshOS();
      const dir = path.join(process.cwd(), "plugins");
      const loaded = await ashos.loadPlugins(dir);
      if (loaded.includes(name)) console.log(`Plugin "${name}" loaded`);
      else console.error(`Plugin "${name}" not found under ${dir}`);
    });
}
