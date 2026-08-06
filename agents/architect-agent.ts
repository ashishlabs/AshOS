import { BaseAgent } from "./base-agent";
import type { AgentContext, AgentResult, AgentTask } from "./types";

/**
 * Proposes system architecture and design tradeoffs for a described
 * feature or system — module/component boundaries, data flow, and what
 * would actually break under scale or a likely future change. Same
 * optional-target-file shape as `CodeAgent` for writing the result (e.g.
 * an architecture decision record) to disk.
 */
export class ArchitectAgent extends BaseAgent {
  name = "architect";
  description = "Proposes system architecture and design tradeoffs for a feature or system";
  capabilities = ["architecture"];

  async run(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const targetFile = task.input?.file as string | undefined;

    const { content } = await context.provider.chat([
      {
        role: "system",
        content:
          "You are a software architect. For the described feature or system, propose module/component boundaries and data flow, and call out the key design tradeoffs — not an exhaustive spec. Reason about what would break at scale or under a specific likely change. Be concrete and reference the actual feature described, not generic architecture advice."
      },
      { role: "user", content: task.description }
    ]);

    if (targetFile) {
      const write = await context.tools.get("fs")?.execute({ action: "write", args: { path: targetFile, content } });
      if (!write?.ok) return { ok: false, error: write?.error ?? "fs tool unavailable" };
      return { ok: true, output: `wrote ${targetFile}`, data: { file: targetFile } };
    }

    return { ok: true, output: content };
  }
}
