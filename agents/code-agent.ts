import { BaseAgent } from "./base-agent";
import type { AgentContext, AgentResult, AgentTask } from "./types";

/** Asks the active AIProvider to write code for a task description, optionally writing the result to a file. */
export class CodeAgent extends BaseAgent {
  name = "code";
  description = "Writes and edits code to satisfy a task description";
  capabilities = ["code", "implement"];

  async run(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const targetFile = task.input?.file as string | undefined;

    const { content } = await context.provider.chat([
      { role: "system", content: "You are a precise senior software engineer. Reply with code only, no prose, no markdown fences." },
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
