import { Command } from "commander";
import { AshOS } from "../../sdk/ashos";
import type { ReflectionData } from "../../agents/reflection";

export function registerReflectCommand(program: Command): void {
  program
    .command("reflect [period]")
    .description('Generate a review narrative: "daily" (default), "weekly", or "monthly"')
    .action(async (period: string | undefined) => {
      const ashos = new AshOS();
      const result = await ashos.runAgent("reflection", { description: "reflect", input: { period } });
      if (!result.ok) {
        console.error(result.error);
        process.exitCode = 1;
        return;
      }

      const data = result.data as ReflectionData & { narrative: string };
      console.log(`Reflection (${data.period}) — ${data.windowStart} to ${data.windowEnd}`);
      console.log(data.narrative);
      console.log(
        `\nOutcomes: ${data.outcomes.success}/${data.outcomes.total} succeeded` +
          (data.outcomes.failure ? `, ${data.outcomes.failure} failed` : "")
      );
      console.log(`Inbox: ${data.inbox.captured} captured (${data.inbox.reviewed} reviewed, ${data.inbox.archived} archived)`);
      console.log(`Knowledge graph: ${data.knowledgeGraph.newNodes} new node(s)`);
    });
}
