import { BaseAgent } from "./base-agent";
import type { AgentContext, AgentResult, AgentTask } from "./types";

/** Fallback worker for tasks that don't map to a specialized capability: just asks the provider. */
export class GenericAgent extends BaseAgent {
  name = "generic";
  description = "Handles arbitrary tasks by asking the active AI provider directly";
  capabilities = ["generic"];

  async run(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const { content } = await context.provider.chat([
      { role: "system", content: "You are a helpful, precise assistant embedded in AshOS." },
      { role: "user", content: task.description }
    ]);
    return { ok: true, output: content };
  }
}
