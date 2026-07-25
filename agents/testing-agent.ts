import { BaseAgent } from "./base-agent";
import type { AgentContext, AgentResult, AgentTask } from "./types";

/** Runs the project's test command (via the shell tool) and reports pass/fail. */
export class TestingAgent extends BaseAgent {
  name = "testing";
  description = "Runs the project's test suite and reports results";
  capabilities = ["test", "verify"];

  async run(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const shellTool = context.tools.get("shell");
    if (!shellTool) return { ok: false, error: "shell tool not registered" };

    const command = (task.input?.command as string) ?? "npm test";
    const result = await shellTool.execute({ action: "run", args: { command, cwd: context.cwd } });
    return { ok: result.ok, output: result.output, error: result.error };
  }
}
