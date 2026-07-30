import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { BuildResult, TestResult, WorkspaceExecutor } from "./workspace-executor";

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024, shell: process.platform === "win32" }, (error, stdout, stderr) => {
      let code = 0;
      if (error) {
        const errCode = (error as NodeJS.ErrnoException).code;
        code = typeof errCode === "number" ? errCode : 1;
      }
      resolve({ code, stdout: stdout.toString(), stderr: stderr.toString() });
    });
  });
}

/**
 * Links (rather than reinstalls) node_modules from the source repo into an
 * experiment worktree. Worktrees share the repo's git history but not its
 * untracked/gitignored node_modules — reinstalling per experiment would be
 * slow and network-dependent, and none of the built-in mutations touch
 * package.json, so sharing the dependency tree is safe.
 */
export function linkNodeModules(repoRoot: string, worktreePath: string): void {
  const src = path.join(repoRoot, "node_modules");
  const dest = path.join(worktreePath, "node_modules");
  if (fs.existsSync(dest) || !fs.existsSync(src)) return;
  fs.symlinkSync(src, dest, "junction");
}

/**
 * Real, process-spawning implementation of WorkspaceExecutor. `build()` and
 * `test()` shell out to the workspace's own npm scripts; `execute()` runs a
 * single input through the workspace's own CLI (`ash evolve exec`, added
 * specifically as a stable, script-friendly stdout contract — plain
 * `ash run`'s human-formatted output isn't meant to be parsed) so benchmark
 * scoring reflects whatever the mutation actually changed, not just the
 * research provider's opinion of it.
 */
export class SubprocessWorkspaceExecutor implements WorkspaceExecutor {
  constructor(private readonly repoRoot: string) {}

  async build(worktreePath: string, timeoutMs: number): Promise<BuildResult> {
    linkNodeModules(this.repoRoot, worktreePath);
    const { code, stdout, stderr } = await run("npm", ["run", "typecheck"], worktreePath, timeoutMs);
    return { success: code === 0, log: stdout + stderr };
  }

  async test(worktreePath: string, timeoutMs: number): Promise<TestResult> {
    linkNodeModules(this.repoRoot, worktreePath);
    const { stdout, stderr } = await run("npm", ["test"], worktreePath, timeoutMs);
    const log = stdout + stderr;
    const failedMatch = log.match(/(\d+)\s+failed/);
    const passedMatch = log.match(/(\d+)\s+passed/);
    return {
      passed: passedMatch ? parseInt(passedMatch[1], 10) : 0,
      failed: failedMatch ? parseInt(failedMatch[1], 10) : 0,
      log
    };
  }

  async execute(worktreePath: string, input: string, timeoutMs: number): Promise<string> {
    linkNodeModules(this.repoRoot, worktreePath);
    const { stdout } = await run("npx", ["tsx", "cli/index.ts", "evolve", "exec", "--input", input], worktreePath, timeoutMs);
    const lastLine = stdout.trim().split("\n").pop() ?? "";
    try {
      const parsed = JSON.parse(lastLine) as { content?: string };
      return typeof parsed.content === "string" ? parsed.content : stdout;
    } catch {
      return stdout;
    }
  }
}
