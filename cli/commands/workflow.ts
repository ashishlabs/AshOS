import { Command } from "commander";
import { AshOS } from "../../sdk/ashos";

export function registerWorkflowCommand(program: Command): void {
  const workflow = program.command("workflow").description("Run user-authored JSON workflow files (see examples/workflows/)");

  workflow
    .command("run <file>")
    .description("Run a workflow definition from a JSON file")
    .action(async (file: string) => {
      const ashos = new AshOS();
      let results: Awaited<ReturnType<typeof ashos.runWorkflowFile>>;
      try {
        results = await ashos.runWorkflowFile(file);
      } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
        return;
      }

      let anyFailed = false;
      for (const [id, result] of results) {
        const icon = result.status === "success" ? "✔" : result.status === "failed" ? "✘" : "○";
        if (result.status === "failed") anyFailed = true;
        console.log(`${icon} ${id}${result.error ? ` — ${result.error}` : ""}`);
        if (typeof result.output === "string" && result.output) {
          console.log(`  ${result.output.split("\n").join("\n  ")}`);
        }
      }
      if (anyFailed) process.exitCode = 1;
    });
}
