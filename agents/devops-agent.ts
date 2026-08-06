import { BaseAgent } from "./base-agent";
import type { AgentContext, AgentResult, AgentTask } from "./types";

/**
 * Produces or reviews deployment/CI-CD/infrastructure artifacts
 * (Dockerfiles, CI workflow configs, deploy scripts) — same optional-
 * target-file shape as `CodeAgent`, since its output is also usually a
 * file meant to be written, not just read.
 */
export class DevOpsAgent extends BaseAgent {
  name = "devops";
  description = "Writes and reviews deployment, CI/CD, and infrastructure configuration";
  capabilities = ["devops"];

  async run(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const targetFile = task.input?.file as string | undefined;

    const { content } = await context.provider.chat([
      {
        role: "system",
        content:
          "You are a DevOps engineer. Produce practical, working deployment/CI-CD/infrastructure artifacts (Dockerfiles, CI workflow configs, deploy scripts) or reviews of the same, scoped exactly to what's asked. Reply with the artifact or review only — no prose preamble, no markdown fences around the artifact itself."
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
