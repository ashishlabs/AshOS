import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PermissionManager } from "../kernel/permission-manager";
import type { Tool, ToolCapabilities, ToolExecuteRequest, ToolExecuteResult, ToolHealth, ToolRequirements } from "./types";

const execFileAsync = promisify(execFile);

/**
 * Executes shell commands via a POSIX shell. Every command is gated through
 * the PermissionManager, which blocks/asks-about destructive patterns
 * (rm -rf, git push, docker rm, ...) before anything runs.
 */
export class ShellTool implements Tool {
  constructor(private permissionManager?: PermissionManager) {}

  capabilities(): ToolCapabilities {
    return { name: "shell", description: "Run arbitrary shell commands", actions: ["run"] };
  }

  requirements(): ToolRequirements {
    return { binaries: ["bash"] };
  }

  permissions(): { dangerous: boolean } {
    return { dangerous: true };
  }

  async healthCheck(): Promise<ToolHealth> {
    try {
      await execFileAsync("bash", ["-c", "echo ok"]);
      return { healthy: true };
    } catch (error) {
      return { healthy: false, detail: (error as Error).message };
    }
  }

  async execute(request: ToolExecuteRequest): Promise<ToolExecuteResult> {
    const command = String(request.args?.command ?? "");
    if (!command) return { ok: false, error: "missing 'command' argument" };

    if (this.permissionManager) {
      const allowed = await this.permissionManager.check({ actor: "tool:shell", action: command, reason: "shell execution" });
      if (!allowed) return { ok: false, error: `permission denied for command: ${command}` };
    }

    try {
      const cwd = typeof request.args?.cwd === "string" ? request.args.cwd : process.cwd();
      const { stdout, stderr } = await execFileAsync("bash", ["-c", command], { cwd, maxBuffer: 10 * 1024 * 1024 });
      return { ok: true, output: stdout || stderr };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; message: string };
      return { ok: false, error: err.stderr || err.message, output: err.stdout };
    }
  }
}
