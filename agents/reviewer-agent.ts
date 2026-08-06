import { BaseAgent } from "./base-agent";
import type { AgentContext, AgentResult, AgentTask } from "./types";

/**
 * Reviews code for correctness, style, and maintainability — the natural
 * pairing for a code-producing task's output (see `docs/verification-gate.md`
 * for the automated pass/fail check this complements, not replaces). Reads
 * `task.input.file` for context when reviewing an existing file; otherwise
 * reviews whatever's in `task.description` (e.g. a pasted diff or snippet).
 */
export class ReviewerAgent extends BaseAgent {
  name = "reviewer";
  description = "Reviews code for correctness, style, security, and maintainability issues";
  capabilities = ["review", "code-review"];

  async run(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const file = task.input?.file as string | undefined;
    let subject = task.description;

    if (file) {
      const read = await context.tools.get("fs")?.execute({ action: "read", args: { path: file } });
      if (!read?.ok) return { ok: false, error: read?.error ?? "fs tool unavailable" };
      subject = `File: ${file}\n\n${read.output}`;
    }

    const { content } = await context.provider.chat([
      {
        role: "system",
        content:
          "You are a senior code reviewer. Review the following for correctness, style, security, and maintainability. Structure your response with headings: Findings, Risks, Suggestions. Be specific — cite the actual code, don't restate it verbatim or give generic advice."
      },
      { role: "user", content: subject }
    ]);

    return { ok: true, output: content };
  }
}
