import { Command } from "commander";
import { AshOS } from "../../sdk/ashos";

export function registerDocsCommand(program: Command): void {
  const cmd = program.command("docs").description("AI-generated documentation, grounded in real source (via the Documentation Writer agent)");

  cmd
    .command("generate")
    .description("Generate Markdown documentation for a file or a module directory (exactly one of --file/--dir is required)")
    .option("-f, --file <path>", "document a single source file")
    .option("-d, --dir <path>", "document a module directory (structural overview, not full file contents)")
    .option("-o, --output <path>", "where to write the generated doc (defaults to .ashos/generated-docs/<slug>.md)")
    .action(async (opts: { file?: string; dir?: string; output?: string }) => {
      if (!opts.file && !opts.dir) {
        console.error("Specify --file <path> or --dir <path>.");
        process.exitCode = 1;
        return;
      }
      const ashos = new AshOS();
      const result = await ashos.runAgent("documentation", {
        description: `document ${opts.file ?? opts.dir}`,
        input: { file: opts.file, dir: opts.dir, outputFile: opts.output }
      });
      if (!result.ok) {
        console.error(result.error);
        process.exitCode = 1;
        return;
      }
      const data = result.data as { outputFile: string };
      console.log(`Wrote ${data.outputFile}`);
      console.log(`\n${result.output}`);
    });
}
