import { Command } from "commander";
import { AshOS } from "../../sdk/ashos";

export function registerPlanCommand(program: Command): void {
  program
    .command("plan <goal...>")
    .description("Decompose a goal into a task graph without executing it")
    .action(async (goalParts: string[]) => {
      const ashos = new AshOS();
      const graph = await ashos.plan(goalParts.join(" "));
      console.log(`Goal: ${graph.goal}\n`);
      for (const task of graph.tasks) {
        const deps = task.dependsOn?.length ? ` (after: ${task.dependsOn.join(", ")})` : "";
        console.log(`- [${task.capability}] ${task.title}${deps}\n  ${task.description}`);
      }
    });
}
