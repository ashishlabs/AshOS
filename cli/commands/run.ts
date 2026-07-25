import { Command } from "commander";
import { AshOS } from "../../sdk/ashos";

export function registerRunCommand(program: Command): void {
  program
    .command("run <goal...>")
    .description("Plan and execute a goal end to end")
    .action(async (goalParts: string[]) => {
      const ashos = new AshOS();
      const { graph, results } = await ashos.run(goalParts.join(" "));
      for (const task of graph.tasks) {
        const r = results.get(task.id);
        const icon = r?.status === "success" ? "✔" : r?.status === "failed" ? "✘" : "○";
        console.log(`${icon} ${task.title}${r?.error ? ` — ${r.error}` : ""}`);
        if (r?.output) console.log(`  ${r.output.split("\n").join("\n  ")}`);
      }
    });
}
