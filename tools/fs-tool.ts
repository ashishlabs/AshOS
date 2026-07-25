import fs from "node:fs";
import path from "node:path";
import type { Tool, ToolCapabilities, ToolExecuteRequest, ToolExecuteResult, ToolHealth, ToolRequirements } from "./types";

/** Read/write/list files. No permission gate: scoped to non-destructive operations. */
export class FsTool implements Tool {
  capabilities(): ToolCapabilities {
    return { name: "fs", description: "Read, write and list files", actions: ["read", "write", "list", "exists", "mkdir"] };
  }

  requirements(): ToolRequirements {
    return {};
  }

  permissions(): { dangerous: boolean } {
    return { dangerous: false };
  }

  async healthCheck(): Promise<ToolHealth> {
    return { healthy: true };
  }

  async execute(request: ToolExecuteRequest): Promise<ToolExecuteResult> {
    const target = String(request.args?.path ?? "");
    try {
      switch (request.action) {
        case "read":
          return { ok: true, output: fs.readFileSync(target, "utf-8") };
        case "write":
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, String(request.args?.content ?? ""));
          return { ok: true, output: `wrote ${target}` };
        case "list":
          return { ok: true, output: fs.readdirSync(target).join("\n") };
        case "exists":
          return { ok: true, output: String(fs.existsSync(target)) };
        case "mkdir":
          fs.mkdirSync(target, { recursive: true });
          return { ok: true, output: `created ${target}` };
        default:
          return { ok: false, error: `unknown fs action: ${request.action}` };
      }
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }
}
