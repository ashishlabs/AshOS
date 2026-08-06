import path from "node:path";
import { BaseAgent } from "./base-agent";
import type { AgentContext, AgentResult, AgentTask } from "./types";
import { buildModules, scanRepository } from "../codebase/indexer";

const FILE_SYSTEM_PROMPT =
  "You are AshOS's Documentation Writer. Write clear, accurate Markdown documentation for the following source file: what it does, its public API/exports, and any non-obvious behavior worth calling out. Ground every claim in the actual code shown — do not invent behavior. No preamble, start directly with a heading.";

const MODULE_SYSTEM_PROMPT =
  "You are AshOS's Documentation Writer. Write a Markdown module overview from the following file/symbol structure: what the module is for, its main pieces, and how they likely fit together. Ground every claim in the file and symbol names shown — do not invent behavior you can't see evidence for. No preamble, start directly with a heading.";

function slugify(target: string): string {
  const cleaned = target.replace(/[\\/]+/g, "-").replace(/^-+/, "").replace(/\.[^./]+$/, "");
  return cleaned || "root";
}

/**
 * AI-generated documentation, grounded in real source — the "Documentation
 * Writer" specialist role named in `docs/features/multi-agent-specialist-roles.md`
 * and the capability that closes missing-features.md's "no agent produces
 * documentation" gap. Exactly one of `task.input.file` (documents one file,
 * fed its real content — same `fs`-tool-read convention as `ReviewerAgent`)
 * or `task.input.dir` (documents a module, fed its file/symbol structure via
 * Local Codebase Intelligence's `scanRepository` — same heuristic-over-
 * full-parse tradeoff as `CodebaseAnalystAgent`) is required. Always writes
 * the result to disk (`task.input.outputFile` to override the default
 * `.ashos/generated-docs/<slug>.md`, same optional-target-file convention
 * as `CodeAgent`/`ArchitectAgent`) so "generated documentation" means a
 * real, inspectable file, not just a string a caller might discard.
 */
export class DocumentationAgent extends BaseAgent {
  name = "documentation";
  description = "Writes Markdown documentation for a file or module, grounded in its real source";
  capabilities = ["documentation", "docs"];

  async run(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const input = task.input ?? {};
    const file = input.file as string | undefined;
    const dir = input.dir as string | undefined;

    if (!file && !dir) return { ok: false, error: "specify task.input.file (document one file) or task.input.dir (document a module)" };
    if (file && dir) return { ok: false, error: "specify only one of task.input.file or task.input.dir, not both" };

    const fsTool = context.tools.get("fs");
    if (!fsTool) return { ok: false, error: "fs tool unavailable" };

    let subject: string;
    let systemPrompt: string;
    let target: string;
    let slugSource: string;

    if (file) {
      const read = await fsTool.execute({ action: "read", args: { path: file } });
      if (!read.ok) return { ok: false, error: read.error ?? `could not read ${file}` };
      subject = `File: ${file}\n\n${read.output}`;
      systemPrompt = FILE_SYSTEM_PROMPT;
      target = file;
      slugSource = path.basename(file);
    } else {
      const root = path.join(context.cwd, dir!);
      const files = scanRepository(root);
      if (files.length === 0) return { ok: false, error: `no source files found under ${dir}` };
      const modules = buildModules(files);
      const structure = files
        .map(
          (f) =>
            `${path.join(dir!, f.path)} (${f.language ?? "unknown"})` +
            (f.symbols.length ? ": " + f.symbols.map((s) => `${s.kind} ${s.name}`).join(", ") : "")
        )
        .join("\n");
      subject = `Module: ${dir}\nSub-modules: ${modules.map((m) => m.name).join(", ")}\n\nFiles:\n${structure}`;
      systemPrompt = MODULE_SYSTEM_PROMPT;
      target = dir!;
      slugSource = dir!;
    }

    const { content } = await context.provider.chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: subject }
    ]);

    const outputFile =
      (input.outputFile as string | undefined) ?? path.join(context.cwd, ".ashos", "generated-docs", `${slugify(slugSource)}.md`);
    const write = await fsTool.execute({ action: "write", args: { path: outputFile, content } });
    if (!write.ok) return { ok: false, error: write.error ?? `could not write ${outputFile}` };

    return { ok: true, output: content, data: { target, outputFile } };
  }
}
