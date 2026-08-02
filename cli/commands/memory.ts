import { Command } from "commander";
import { AshOS } from "../../sdk/ashos";
import type { MemoryScope } from "../../memory/types";

export function registerMemoryCommand(program: Command): void {
  const cmd = program.command("memory").description("Inspect AshOS memory");

  cmd
    .command("list")
    .option("-s, --scope <scope>", "short-term|session|project|global")
    .option("-t, --tag <tag>", 'filter by tag, e.g. "outcome", "failure", or an agent name')
    .action((opts) => {
      const ashos = new AshOS();
      const records = ashos.memory.query({ scope: opts.scope as MemoryScope | undefined, tag: opts.tag });
      if (records.length === 0) {
        console.log("No memory records found.");
        return;
      }
      for (const r of records) console.log(`[${r.scope}] ${r.key} = ${JSON.stringify(r.value)}`);
    });

  cmd
    .command("forget <scope> <key>")
    .action((scope: MemoryScope, key: string) => {
      const ashos = new AshOS();
      ashos.memory.forget(scope, key);
      console.log(`Forgot ${scope}/${key}`);
    });
}
