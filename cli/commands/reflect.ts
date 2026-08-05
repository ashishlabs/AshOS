import { Command } from "commander";
import { AshOS } from "../../sdk/ashos";
import { loadSavedReflection } from "../../agents/reflection-store";
import type { ReflectionData, ReflectionPeriod } from "../../agents/reflection";

function printReflection(data: ReflectionData & { narrative: string }): void {
  console.log(`Reflection (${data.period}) — ${data.windowStart} to ${data.windowEnd}`);
  console.log(data.narrative);
  console.log(
    `\nOutcomes: ${data.outcomes.success}/${data.outcomes.total} succeeded` +
      (data.outcomes.failure ? `, ${data.outcomes.failure} failed` : "")
  );
  console.log(`Inbox: ${data.inbox.captured} captured (${data.inbox.reviewed} reviewed, ${data.inbox.archived} archived)`);
  console.log(`Knowledge graph: ${data.knowledgeGraph.newNodes} new node(s)`);
}

export function registerReflectCommand(program: Command): void {
  program
    .command("reflect [period]")
    .description('Generate a review narrative: "daily" (default), "weekly", or "monthly"')
    .option("--cached", "print today's already-saved reflection instead of generating a new one (fails if none was saved today)")
    .option("--save", "save the generated reflection to .ashos/reflections/ so a later --cached call can read it back for free")
    .action(async (period: string | undefined, opts: { cached?: boolean; save?: boolean }) => {
      const ashos = new AshOS();
      const resolvedPeriod = (period as ReflectionPeriod | undefined) ?? "daily";

      if (opts.cached) {
        const saved = loadSavedReflection(ashos.kernel.root, resolvedPeriod);
        if (!saved) {
          console.error(`No saved ${resolvedPeriod} reflection for today yet. Run \`ash reflect ${resolvedPeriod} --save\` first.`);
          process.exitCode = 1;
          return;
        }
        printReflection(saved);
        return;
      }

      if (opts.save) {
        try {
          const saved = await ashos.generateAndSaveReflection(resolvedPeriod);
          printReflection(saved);
          console.log(`\nSaved — \`ash reflect ${resolvedPeriod} --cached\` will read this back without regenerating.`);
        } catch (error) {
          console.error((error as Error).message);
          process.exitCode = 1;
        }
        return;
      }

      const result = await ashos.runAgent("reflection", { description: "reflect", input: { period } });
      if (!result.ok) {
        console.error(result.error);
        process.exitCode = 1;
        return;
      }
      printReflection(result.data as ReflectionData & { narrative: string });
    });
}
