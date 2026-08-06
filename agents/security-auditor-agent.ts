import { BaseAgent } from "./base-agent";
import type { AgentContext, AgentResult, AgentTask } from "./types";

/**
 * Audits code or configuration for real, exploitable security issues —
 * deliberately scoped narrower than `ReviewerAgent` (style/maintainability
 * are out of scope here) so its findings stay signal, not noise. Reads
 * `task.input.file` for context when auditing an existing file; otherwise
 * audits whatever's in `task.description`.
 */
export class SecurityAuditorAgent extends BaseAgent {
  name = "security-auditor";
  description = "Audits code or configuration for security vulnerabilities";
  capabilities = ["security-audit"];

  async run(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const file = task.input?.file as string | undefined;
    let subject = task.description;

    if (file) {
      const read = await context.tools.get("fs")?.execute({ action: "read", args: { path: file } });
      if (!read?.ok) return { ok: false, error: read?.error ?? "fs tool unavailable" };
      subject = `File: ${file}\n\n${read.output}`;
    }

    const { content } = await context.provider.chat([
      {
        role: "system",
        content:
          "You are a security auditor. Review the following for real, exploitable vulnerabilities — injection, broken auth, secrets committed in code, unsafe deserialization, SSRF, path traversal, and similar OWASP-class issues. Ignore purely stylistic concerns. For each finding, state the concrete attack scenario, not just the category name. If nothing concerning is found, say so plainly rather than inventing a finding."
      },
      { role: "user", content: subject }
    ]);

    return { ok: true, output: content };
  }
}
