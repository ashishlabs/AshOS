import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const execFileAsync = promisify(execFile);

export interface GitWorkspaceOptions {
  /** The AshOS repo (or any git repo) experiments branch from. Its working directory is never touched. */
  repoRoot: string;
  /** Defaults to whatever branch repoRoot currently has checked out. */
  baseBranch?: string;
  /** Defaults to "evolution/exp-". */
  branchPrefix?: string;
  /** Defaults to <repoRoot>/.ashos/evolution/worktrees. */
  worktreesDir?: string;
}

export interface ExperimentWorkspace {
  id: string;
  branch: string;
  worktreePath: string;
  baseBranch: string;
}

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], { maxBuffer: 20 * 1024 * 1024 });
    return stdout.trim();
  } catch (error) {
    const err = error as { stderr?: string; message: string };
    throw new Error(`git ${args.join(" ")} failed: ${(err.stderr ?? err.message).trim()}`);
  }
}

/**
 * Isolates every experiment in its own git worktree + branch so mutations
 * never touch the repo's actual working directory. Every method that could
 * plausibly point at "main" refuses to run against it — the caller supplies
 * an integration branch name, and the base branch is discovered read-only.
 *
 * Uses `git worktree` rather than a full clone: same effect (a separate
 * working directory with its own checked-out branch) at a fraction of the
 * cost, since worktrees share the repo's object store.
 */
export class GitWorkspaceManager {
  private baseBranch?: string;
  private readonly branchPrefix: string;
  private readonly worktreesDir: string;

  constructor(private readonly options: GitWorkspaceOptions) {
    this.baseBranch = options.baseBranch;
    this.branchPrefix = options.branchPrefix ?? "evolution/exp-";
    this.worktreesDir = options.worktreesDir ?? path.join(options.repoRoot, ".ashos", "evolution", "worktrees");
  }

  private async resolveBaseBranch(): Promise<string> {
    if (!this.baseBranch) {
      this.baseBranch = await git(this.options.repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
    }
    return this.baseBranch;
  }

  private assertNotProtected(branch: string, baseBranch: string): void {
    const protectedNames = new Set(["main", "master", baseBranch]);
    if (protectedNames.has(branch)) {
      throw new Error(`GitWorkspaceManager: refusing to touch protected branch "${branch}" — never modify main/the base branch directly`);
    }
  }

  /** Creates a new isolated worktree on a fresh branch off the base branch. */
  async createWorkspace(experimentId: string = randomUUID()): Promise<ExperimentWorkspace> {
    const baseBranch = await this.resolveBaseBranch();
    const branch = `${this.branchPrefix}${experimentId}`;
    const worktreePath = path.join(this.worktreesDir, experimentId);
    fs.mkdirSync(this.worktreesDir, { recursive: true });
    await git(this.options.repoRoot, ["worktree", "add", "-b", branch, worktreePath, baseBranch]);
    return { id: experimentId, branch, worktreePath, baseBranch };
  }

  /** Stages and commits every change in the workspace. Returns the resulting commit SHA (or HEAD if nothing changed). */
  async commit(workspace: ExperimentWorkspace, message: string): Promise<string> {
    await git(workspace.worktreePath, ["add", "-A"]);
    const status = await git(workspace.worktreePath, ["status", "--porcelain"]);
    if (status) {
      await git(workspace.worktreePath, ["commit", "-m", message]);
    }
    return git(workspace.worktreePath, ["rev-parse", "HEAD"]);
  }

  async diff(workspace: ExperimentWorkspace): Promise<string> {
    return git(this.options.repoRoot, ["diff", `${workspace.baseBranch}...${workspace.branch}`]);
  }

  async tag(workspace: ExperimentWorkspace, tagName: string): Promise<void> {
    await git(workspace.worktreePath, ["tag", tagName]);
  }

  /**
   * Merges an accepted experiment into a dedicated integration branch
   * (created off the base branch on first use if it doesn't exist yet).
   * Refuses outright if `integrationBranch` resolves to main/master/the
   * base branch — accepted work never lands there automatically.
   */
  async mergeToIntegrationBranch(workspace: ExperimentWorkspace, integrationBranch: string): Promise<string> {
    this.assertNotProtected(integrationBranch, workspace.baseBranch);

    const existing = await git(this.options.repoRoot, ["branch", "--list", integrationBranch]);
    if (!existing) {
      await git(this.options.repoRoot, ["branch", integrationBranch, workspace.baseBranch]);
    }

    const integrationPath = path.join(this.worktreesDir, `_integration_${integrationBranch.replace(/[\\/]/g, "_")}`);
    if (!fs.existsSync(integrationPath)) {
      await git(this.options.repoRoot, ["worktree", "add", integrationPath, integrationBranch]);
    }

    await git(integrationPath, ["merge", "--no-ff", workspace.branch, "-m", `evolution: merge accepted experiment ${workspace.id}`]);
    return git(integrationPath, ["rev-parse", "HEAD"]);
  }

  /** Removes the experiment's worktree and deletes its branch. Safe to call after rejection or after a successful merge. */
  async rollback(workspace: ExperimentWorkspace): Promise<void> {
    this.assertNotProtected(workspace.branch, workspace.baseBranch);
    try {
      await git(this.options.repoRoot, ["worktree", "remove", workspace.worktreePath, "--force"]);
    } catch {
      await git(this.options.repoRoot, ["worktree", "prune"]).catch(() => {});
    }
    await git(this.options.repoRoot, ["branch", "-D", workspace.branch]).catch(() => {});
  }

  /**
   * Experiment IDs that currently have a worktree directory on disk — a
   * plain filesystem listing, deliberately not a git call, so it's cheap
   * and safe to call even when `repoRoot` isn't a git repo at all (e.g. in
   * tests). Excludes the special `_integration_*` worktree used by
   * `mergeToIntegrationBranch`. Every ID returned here was left behind by
   * `createWorkspace` and never reached `rollback` — normally that only
   * happens mid-experiment (a crash), since every other path (rejected,
   * accepted+merged) calls `rollback` itself; the one *intentional*
   * survivor is an accepted experiment with `autoMerge` off, left for
   * manual review — callers should cross-reference `ExperimentStore`
   * before deciding whether a given ID is actually orphaned.
   */
  listWorktreeIds(): string[] {
    if (!fs.existsSync(this.worktreesDir)) return [];
    return fs
      .readdirSync(this.worktreesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_integration_"))
      .map((entry) => entry.name);
  }

  /**
   * Removes a leftover worktree/branch for an experiment ID with no live
   * `ExperimentWorkspace` object in memory (e.g. reconstructed after a
   * restart). Reconstructs the workspace shape from the same naming
   * convention `createWorkspace` used, then delegates to `rollback`.
   */
  async pruneOrphan(id: string): Promise<ExperimentWorkspace> {
    const baseBranch = await this.resolveBaseBranch();
    const workspace: ExperimentWorkspace = {
      id,
      branch: `${this.branchPrefix}${id}`,
      worktreePath: path.join(this.worktreesDir, id),
      baseBranch
    };
    await this.rollback(workspace);
    return workspace;
  }
}
