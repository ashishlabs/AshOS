import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PermissionManager } from "../kernel/permission-manager";
import type { Tool, ToolCapabilities, ToolExecuteRequest, ToolExecuteResult, ToolHealth, ToolRequirements } from "./types";

const execFileAsync = promisify(execFile);

/** Thin wrapper around the `git` CLI: clone, commit, branch, merge, status, diff, log. */
export class GitTool implements Tool {
  constructor(private permissionManager?: PermissionManager) {}

  capabilities(): ToolCapabilities {
    return {
      name: "git",
      description: "Clone, commit, branch, merge and inspect git repositories",
      actions: ["clone", "commit", "branch", "merge", "status", "diff", "log", "push"]
    };
  }

  requirements(): ToolRequirements {
    return { binaries: ["git"] };
  }

  permissions(): { dangerous: boolean } {
    return { dangerous: true };
  }

  async healthCheck(): Promise<ToolHealth> {
    try {
      const { stdout } = await execFileAsync("git", ["--version"]);
      return { healthy: true, detail: stdout.trim() };
    } catch (error) {
      return { healthy: false, detail: (error as Error).message };
    }
  }

  private async run(args: string[], cwd?: string): Promise<ToolExecuteResult> {
    const commandString = `git ${args.join(" ")}`;
    if (this.permissionManager) {
      const allowed = await this.permissionManager.check({ actor: "tool:git", action: commandString, reason: "git operation" });
      if (!allowed) return { ok: false, error: `permission denied for: ${commandString}` };
    }
    try {
      const { stdout, stderr } = await execFileAsync("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 });
      return { ok: true, output: stdout || stderr };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; message: string };
      return { ok: false, error: err.stderr || err.message };
    }
  }

  async execute(request: ToolExecuteRequest): Promise<ToolExecuteResult> {
    const cwd = typeof request.args?.cwd === "string" ? request.args.cwd : process.cwd();
    switch (request.action) {
      case "clone":
        return this.run(["clone", String(request.args?.url), String(request.args?.dest ?? "")].filter(Boolean), cwd);
      case "commit":
        return this.run(["commit", "-m", String(request.args?.message ?? "chore: update")], cwd);
      case "branch":
        return this.run(["checkout", "-b", String(request.args?.name)], cwd);
      case "merge":
        return this.run(["merge", String(request.args?.branch)], cwd);
      case "status":
        return this.run(["status", "--short"], cwd);
      case "diff":
        return this.run(["diff"], cwd);
      case "log":
        return this.run(["log", "--oneline", "-n", String(request.args?.limit ?? 10)], cwd);
      case "push":
        return this.run(["push", String(request.args?.remote ?? "origin"), String(request.args?.branch ?? "HEAD")], cwd);
      default:
        return { ok: false, error: `unknown git action: ${request.action}` };
    }
  }
}
