import { Command } from "commander";
import { AshOS } from "../../sdk/ashos";
import { isInitialized } from "../../kernel/config";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show AshOS status: provider, agents, tools, plugins")
    .action(() => {
      const root = process.cwd();
      console.log(`Initialized: ${isInitialized(root) ? "yes" : "no (run `ash init`)"}`);
      const ashos = new AshOS({ root });
      console.log(`Active provider: ${ashos.providers.active().name()}`);
      console.log(`Agents: ${ashos.agents.list().map((a) => a.name).join(", ")}`);
      console.log(`Tools: ${ashos.tools.list().map((t) => t.capabilities().name).join(", ")}`);
    });
}
