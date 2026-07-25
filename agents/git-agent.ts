import { BaseAgent } from "./base-agent";
import type { AgentContext, AgentResult, AgentTask } from "./types";

/** Delegates git operations (clone/commit/branch/merge/push) to the git tool. */
export class GitAgent extends BaseAgent {
  name = "git";
  description = "Performs git operations: clone, commit, branch, merge, review";
  capabilities = ["git", "vcs"];

  async run(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const gitTool = context.tools.get("git");
    if (!gitTool) return { ok: false, error: "git tool not registered" };

    const action = (task.input?.action as string) ?? "status";
    const result = await gitTool.execute({ action, args: { cwd: context.cwd, ...task.input } });
    return { ok: result.ok, output: result.output, error: result.error };
  }
}
