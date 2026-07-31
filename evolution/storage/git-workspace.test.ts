import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GitWorkspaceManager } from "./git-workspace";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args]);
  return stdout.trim();
}

/** A throwaway repo with one commit on "main" — never the real AshOS repo. */
async function makeTempRepo(): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-evo-repo-"));
  await git(dir, ["init", "-b", "main"]);
  await git(dir, ["config", "user.email", "test@example.com"]);
  await git(dir, ["config", "user.name", "Test"]);
  await git(dir, ["config", "commit.gpgsign", "false"]);
  fs.writeFileSync(path.join(dir, "README.md"), "hello\n");
  await git(dir, ["add", "-A"]);
  await git(dir, ["commit", "-m", "initial commit"]);
  return dir;
}

describe("GitWorkspaceManager", () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await makeTempRepo();
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  it("creates an isolated worktree on a new branch off the base branch", async () => {
    const manager = new GitWorkspaceManager({ repoRoot });
    const workspace = await manager.createWorkspace("exp-1");

    expect(workspace.baseBranch).toBe("main");
    expect(workspace.branch).toBe("evolution/exp-exp-1");
    expect(fs.existsSync(path.join(workspace.worktreePath, "README.md"))).toBe(true);
    expect(await git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("main");
  });

  it("commits changes made in the worktree without touching the base branch", async () => {
    const manager = new GitWorkspaceManager({ repoRoot });
    const workspace = await manager.createWorkspace("exp-2");

    fs.writeFileSync(path.join(workspace.worktreePath, "README.md"), "mutated\n");
    const sha = await manager.commit(workspace, "apply mutation");

    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    expect(fs.readFileSync(path.join(repoRoot, "README.md"), "utf-8")).toBe("hello\n");

    const diff = await manager.diff(workspace);
    expect(diff).toContain("-hello");
    expect(diff).toContain("+mutated");
  });

  it("commit is a no-op (returns HEAD) when the mutation made no changes", async () => {
    const manager = new GitWorkspaceManager({ repoRoot });
    const workspace = await manager.createWorkspace("exp-noop");
    const before = await git(workspace.worktreePath, ["rev-parse", "HEAD"]);
    const after = await manager.commit(workspace, "nothing changed");
    expect(after).toBe(before);
  });

  it("merges an accepted experiment into a dedicated integration branch, never main", async () => {
    const manager = new GitWorkspaceManager({ repoRoot });
    const workspace = await manager.createWorkspace("exp-3");
    fs.writeFileSync(path.join(workspace.worktreePath, "README.md"), "improved\n");
    await manager.commit(workspace, "improvement");

    await manager.mergeToIntegrationBranch(workspace, "evolution/accepted");

    const integrationContent = await git(repoRoot, ["show", "evolution/accepted:README.md"]);
    expect(integrationContent).toBe("improved");

    // main is completely untouched
    expect(fs.readFileSync(path.join(repoRoot, "README.md"), "utf-8")).toBe("hello\n");
    const mainContent = await git(repoRoot, ["show", "main:README.md"]);
    expect(mainContent).toBe("hello");
  });

  it("refuses to merge into main/master/the base branch", async () => {
    const manager = new GitWorkspaceManager({ repoRoot });
    const workspace = await manager.createWorkspace("exp-4");

    await expect(manager.mergeToIntegrationBranch(workspace, "main")).rejects.toThrow(/refusing to touch protected branch/);
    await expect(manager.mergeToIntegrationBranch(workspace, "master")).rejects.toThrow(/refusing to touch protected branch/);
  });

  it("rolls back a rejected experiment: worktree and branch are gone, base branch is untouched", async () => {
    const manager = new GitWorkspaceManager({ repoRoot });
    const workspace = await manager.createWorkspace("exp-5");
    fs.writeFileSync(path.join(workspace.worktreePath, "README.md"), "bad idea\n");
    await manager.commit(workspace, "bad mutation");

    await manager.rollback(workspace);

    expect(fs.existsSync(workspace.worktreePath)).toBe(false);
    const branches = await git(repoRoot, ["branch", "--list", workspace.branch]);
    expect(branches).toBe("");
    expect(fs.readFileSync(path.join(repoRoot, "README.md"), "utf-8")).toBe("hello\n");
  });

  it("listWorktreeIds returns worktree ids present on disk, excluding integration worktrees", async () => {
    const manager = new GitWorkspaceManager({ repoRoot });
    expect(manager.listWorktreeIds()).toEqual([]);

    const a = await manager.createWorkspace("exp-a");
    const b = await manager.createWorkspace("exp-b");
    fs.writeFileSync(path.join(a.worktreePath, "a.txt"), "a\n");
    await manager.commit(a, "add a");
    await manager.mergeToIntegrationBranch(a, "evolution/accepted"); // creates a "_integration_..." worktree too

    const ids = manager.listWorktreeIds().sort();
    expect(ids).toEqual(["exp-a", "exp-b"]);
  });

  it("pruneOrphan removes a leftover worktree/branch reconstructed only from its id", async () => {
    const manager = new GitWorkspaceManager({ repoRoot });
    const workspace = await manager.createWorkspace("exp-orphan");
    fs.writeFileSync(path.join(workspace.worktreePath, "README.md"), "half-finished\n");
    await manager.commit(workspace, "half-finished mutation");

    // Simulate a fresh process that only knows the id (e.g. after a crash + restart).
    const fresh = new GitWorkspaceManager({ repoRoot });
    const pruned = await fresh.pruneOrphan("exp-orphan");

    expect(pruned.branch).toBe(workspace.branch);
    expect(fs.existsSync(workspace.worktreePath)).toBe(false);
    const branches = await git(repoRoot, ["branch", "--list", workspace.branch]);
    expect(branches).toBe("");
    expect(fs.readFileSync(path.join(repoRoot, "README.md"), "utf-8")).toBe("hello\n");
  });

  it("reuses the same integration branch/worktree across multiple accepted experiments", async () => {
    const manager = new GitWorkspaceManager({ repoRoot });

    const first = await manager.createWorkspace("exp-6a");
    fs.writeFileSync(path.join(first.worktreePath, "a.txt"), "a\n");
    await manager.commit(first, "add a");
    await manager.mergeToIntegrationBranch(first, "evolution/accepted");

    const second = await manager.createWorkspace("exp-6b");
    fs.writeFileSync(path.join(second.worktreePath, "b.txt"), "b\n");
    await manager.commit(second, "add b");
    await manager.mergeToIntegrationBranch(second, "evolution/accepted");

    expect(await git(repoRoot, ["show", "evolution/accepted:a.txt"])).toBe("a");
    expect(await git(repoRoot, ["show", "evolution/accepted:b.txt"])).toBe("b");
  });
});
