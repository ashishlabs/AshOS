import { Command } from "commander";
import { AshOS } from "../../sdk/ashos";

export function registerSearchCommand(program: Command): void {
  program
    .command("search <query>")
    .description("Hybrid search across Memory, the Knowledge Graph, the Inbox, and the Vault")
    .option("-l, --limit <n>", "max results", (v) => parseInt(v, 10), 20)
    .option("-s, --semantic", "use semantic (embedding) search for the Memory slice instead of keyword matching")
    .action(async (query: string, opts) => {
      const ashos = new AshOS();
      const results = await ashos.search.search(query, { limit: opts.limit, semantic: opts.semantic });

      if (results.length === 0) {
        console.log(`No results for "${query}".`);
        return;
      }
      for (const r of results) {
        console.log(`[${r.source}] (${r.score.toFixed(2)}) ${r.title}`);
        console.log(`  ${r.snippet}`);
      }
    });
}
