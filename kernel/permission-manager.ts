import fs from "node:fs";
import path from "node:path";
import type { EventBus } from "./event-bus";

export type PermissionDecision = "allow-once" | "always-allow" | "deny";

export interface PermissionRequest {
  /** e.g. "tool:shell", "tool:git", "agent:git" */
  actor: string;
  /** e.g. "rm -rf dist", "git push origin main" */
  action: string;
  /** why this is considered dangerous */
  reason: string;
}

export type PermissionPrompter = (request: PermissionRequest) => Promise<PermissionDecision> | PermissionDecision;

const DANGEROUS_PATTERNS: RegExp[] = [
  /\brm\s+-rf\b/i,
  /\bformat\b/i,
  /\bdd\s+if=/i,
  /\bgit\s+push\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bdocker\s+(rm|rmi|system\s+prune)\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bmkfs\b/i,
  /\bchmod\s+-R\s+777\b/i,
  />\s*\/dev\/sd/i
];

/**
 * Gate for anything that touches the filesystem/network/OS in a
 * hard-to-reverse way. Tools call `check()` before executing; the manager
 * either short-circuits from a persisted "always allow" decision, asks the
 * registered prompter, or denies by default when non-interactive.
 */
export class PermissionManager {
  private alwaysAllow = new Set<string>();
  private prompter?: PermissionPrompter;

  constructor(
    private storePath: string,
    private eventBus?: EventBus
  ) {
    this.load();
  }

  setPrompter(prompter: PermissionPrompter): void {
    this.prompter = prompter;
  }

  static isDangerous(action: string): { dangerous: boolean; reason: string } {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(action)) {
        return { dangerous: true, reason: `matched dangerous pattern: ${pattern.source}` };
      }
    }
    return { dangerous: false, reason: "" };
  }

  private key(request: PermissionRequest): string {
    return `${request.actor}::${request.action}`;
  }

  async check(request: PermissionRequest): Promise<boolean> {
    const { dangerous, reason } = PermissionManager.isDangerous(request.action);
    if (!dangerous) return true;

    const key = this.key(request);
    if (this.alwaysAllow.has(key)) return true;

    this.eventBus?.emit("permission:requested", { ...request, reason });
    const decision = this.prompter
      ? await this.prompter({ ...request, reason })
      : "deny";
    this.eventBus?.emit("permission:decided", { ...request, decision });

    if (decision === "always-allow") {
      this.alwaysAllow.add(key);
      this.save();
      return true;
    }
    return decision === "allow-once";
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.storePath, "utf-8");
      const data = JSON.parse(raw) as string[];
      this.alwaysAllow = new Set(data);
    } catch {
      this.alwaysAllow = new Set();
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify([...this.alwaysAllow], null, 2));
  }
}
