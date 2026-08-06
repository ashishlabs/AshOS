import { BaseAgent } from "./base-agent";
import type { AgentContext, AgentResult, AgentTask } from "./types";

/**
 * Proposes UI/UX structure for a described feature or screen — component
 * breakdown, interaction states, and concrete accessibility
 * considerations. Same optional-target-file shape as `CodeAgent` for
 * writing the result (a design note, a component skeleton) to disk.
 */
export class UIDesignerAgent extends BaseAgent {
  name = "ui-designer";
  description = "Designs UI/UX structure, component breakdown, and accessibility guidance for a feature";
  capabilities = ["ui-design"];

  async run(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const targetFile = task.input?.file as string | undefined;

    const { content } = await context.provider.chat([
      {
        role: "system",
        content:
          "You are a UI/UX designer. For the described feature or screen, propose a component structure, the key interaction states (loading, empty, error, success), and concrete accessibility considerations (keyboard navigation, ARIA roles/labels, color contrast). Be specific to the feature actually described — not generic design advice."
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
