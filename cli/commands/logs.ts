import { Command } from "commander";
import { AshOS } from "../../sdk/ashos";

export function registerLogsCommand(program: Command): void {
  program
    .command("logs")
    .description("Tail recent AshOS log entries and events")
    .action(() => {
      const ashos = new AshOS();
      const entries = ashos.kernel.logger.getEntries();
      if (entries.length === 0) {
        console.log("No log entries yet for this process.");
        return;
      }
      for (const e of entries) console.log(`${e.timestamp} ${e.level.toUpperCase()} ${e.message}`);
    });
}
