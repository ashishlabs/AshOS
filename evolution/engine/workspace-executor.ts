export interface BuildResult {
  success: boolean;
  log: string;
}

export interface TestResult {
  passed: number;
  failed: number;
  log: string;
}

/**
 * Everything the Evolution Engine needs to do *inside* an isolated
 * experiment workspace: build it, test it, and run a single input through
 * its own (possibly mutated) pipeline to get real output back. Kept as an
 * interface so the engine's orchestration logic can be unit tested with an
 * in-memory fake, while `SubprocessWorkspaceExecutor` provides the real,
 * process-spawning implementation used in production.
 */
export interface WorkspaceExecutor {
  build(worktreePath: string, timeoutMs: number): Promise<BuildResult>;
  test(worktreePath: string, timeoutMs: number): Promise<TestResult>;
  execute(worktreePath: string, input: string, timeoutMs: number): Promise<string>;
}
