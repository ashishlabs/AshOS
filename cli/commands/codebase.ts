import { Command } from "commander";
import { AshOS } from "../../sdk/ashos";
import type { CodebaseIndex } from "../../codebase/types";

export function registerCodebaseCommand(program: Command): void {
  const cmd = program.command("codebase").description("Local Codebase Intelligence: index and search the working repository on disk");

  cmd
    .command("index [path]")
    .description("Index a repository (defaults to the current directory), caching by git commit hash")
    .option("-f, --force", "reindex even if the cached index is already up to date")
    .action(async (path: string | undefined, opts) => {
      const ashos = new AshOS();
      const root = path ?? process.cwd();
      const result = await ashos.runAgent("codebase-analyst", { description: `index ${root}`, input: { root, force: opts.force } });
      if (!result.ok) {
        console.error(result.error);
        process.exitCode = 1;
        return;
      }
      console.log(result.output);
    });

  cmd
    .command("find <query>")
    .description('Search a previously indexed repository for a symbol or file path (e.g. "find loginUser")')
    .option("-p, --path <path>", "repository root to search (defaults to the current directory)")
    .action(async (query: string, opts) => {
      const ashos = new AshOS();
      const root = opts.path ?? process.cwd();
      const result = await ashos.runAgent("codebase-analyst", { description: `find ${query}`, input: { root, query } });
      if (!result.ok) {
        console.error(result.error);
        process.exitCode = 1;
        return;
      }
      console.log(result.output);
    });

  cmd
    .command("list")
    .description("List every repository indexed so far")
    .action(() => {
      const ashos = new AshOS();
      const indexes = ashos.codebase.list();
      if (indexes.length === 0) {
        console.log('No repositories indexed yet. Run `ash codebase index` to start.');
        return;
      }
      for (const index of indexes as CodebaseIndex[]) {
        console.log(`${index.root}  ${index.fileCount} file(s), ${index.modules.length} module(s), indexed ${index.indexedAt}`);
      }
    });
}
