import { Command } from "commander";
import { AshOS } from "../../sdk/ashos";
import type { Citation } from "../../agents/ask-agent";

export function registerAskCommand(program: Command): void {
  program
    .command("ask <question...>")
    .description("Ask a question, answered from captured Inbox/Vault/Workspace/Learning/Graph records, with citations")
    .option("-l, --limit <n>", "max records to ground the answer in", (v) => parseInt(v, 10), 8)
    .option("--no-semantic", "use keyword matching instead of semantic (embedding) search")
    .action(async (words: string[], opts: { limit: number; semantic: boolean }) => {
      const ashos = new AshOS();
      const question = words.join(" ");
      const result = await ashos.runAgent("ask", { description: question, input: { question, limit: opts.limit, semantic: opts.semantic } });
      if (!result.ok) {
        console.error(result.error);
        process.exitCode = 1;
        return;
      }
      console.log(result.output);
      const { citations } = result.data as { citations: Citation[] };
      if (citations.length) {
        console.log("\nSources:");
        for (const c of citations) console.log(`  [${c.n}] (${c.source}) ${c.title}`);
      }
    });
}
