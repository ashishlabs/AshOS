import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CodebaseAnalystAgent } from "./codebase-analyst-agent";
import { CodebaseIndexStore } from "../codebase-store";
import type { AgentContext } from "../../agents/types";

function git(args: string[], cwd: string): void {
  execFileSync("git", args, { cwd });
}

function commitAll(cwd: string, message: string): void {
  git(["add", "-A"], cwd);
  git(["commit", "-m", message], cwd);
}

describe("CodebaseAnalystAgent", () => {
  let repoRoot: string;
  let storeRoot: string;
  let context: AgentContext;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-codebase-repo-"));
    storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-codebase-cache-"));
    context = { provider: {} as never, tools: {} as never, cwd: repoRoot };
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(storeRoot, { recursive: true, force: true });
  });

  function initGitRepo(): void {
    git(["init", "-q"], repoRoot);
    git(["config", "user.email", "test@example.com"], repoRoot);
    git(["config", "user.name", "Test"], repoRoot);
  }

  it("indexes a real git repository and reports modules/files", async () => {
    initGitRepo();
    fs.mkdirSync(path.join(repoRoot, "kernel"));
    fs.writeFileSync(path.join(repoRoot, "kernel", "event-bus.ts"), "export class EventBus {}\n");
    commitAll(repoRoot, "init");

    const agent = new CodebaseAnalystAgent(new CodebaseIndexStore(storeRoot));
    const result = await agent.execute({ id: "t1", description: "index" }, context);

    expect(result.ok).toBe(true);
    expect(result.output).toContain("Indexed 1 file(s)");
    const data = result.data as { cached: boolean };
    expect(data.cached).toBe(false);
  });

  it("serves from cache on a second call at the same commit", async () => {
    initGitRepo();
    fs.writeFileSync(path.join(repoRoot, "a.ts"), "export const a = 1;\n");
    commitAll(repoRoot, "init");

    const store = new CodebaseIndexStore(storeRoot);
    const agent = new CodebaseAnalystAgent(store);
    await agent.execute({ id: "t1", description: "index" }, context);
    const second = await agent.execute({ id: "t2", description: "index again" }, context);

    expect((second.data as { cached: boolean }).cached).toBe(true);
  });

  it("re-indexes after a new commit changes the repository", async () => {
    initGitRepo();
    fs.writeFileSync(path.join(repoRoot, "a.ts"), "export const a = 1;\n");
    commitAll(repoRoot, "init");

    const store = new CodebaseIndexStore(storeRoot);
    const agent = new CodebaseAnalystAgent(store);
    await agent.execute({ id: "t1", description: "index" }, context);

    fs.writeFileSync(path.join(repoRoot, "b.ts"), "export const b = 2;\n");
    commitAll(repoRoot, "second");

    const second = await agent.execute({ id: "t2", description: "index again" }, context);
    expect((second.data as { cached: boolean }).cached).toBe(false);
    expect((second.data as { index: { fileCount: number } }).index.fileCount).toBe(2);
  });

  it("force:true bypasses the cache even at the same commit", async () => {
    initGitRepo();
    fs.writeFileSync(path.join(repoRoot, "a.ts"), "export const a = 1;\n");
    commitAll(repoRoot, "init");

    const store = new CodebaseIndexStore(storeRoot);
    const agent = new CodebaseAnalystAgent(store);
    await agent.execute({ id: "t1", description: "index" }, context);
    const second = await agent.execute({ id: "t2", description: "force reindex", input: { force: true } }, context);

    expect((second.data as { cached: boolean }).cached).toBe(false);
  });

  it("always re-scans a non-git directory (no commit hash to cache against)", async () => {
    fs.writeFileSync(path.join(repoRoot, "a.ts"), "export const a = 1;\n");

    const store = new CodebaseIndexStore(storeRoot);
    const agent = new CodebaseAnalystAgent(store);
    await agent.execute({ id: "t1", description: "index" }, context);
    const second = await agent.execute({ id: "t2", description: "index again" }, context);

    expect((second.data as { cached: boolean }).cached).toBe(false);
  });

  it("answers a query by searching the index instead of re-summarizing modules", async () => {
    initGitRepo();
    fs.writeFileSync(path.join(repoRoot, "auth.ts"), "export function loginUser() {}\n");
    commitAll(repoRoot, "init");

    const agent = new CodebaseAnalystAgent(new CodebaseIndexStore(storeRoot));
    const result = await agent.execute({ id: "t1", description: "find login", input: { query: "login" } }, context);

    expect(result.ok).toBe(true);
    expect(result.output).toContain("auth.ts");
    expect(result.output).toContain("loginUser");
  });

  it("reports no matches without failing when a query finds nothing", async () => {
    initGitRepo();
    fs.writeFileSync(path.join(repoRoot, "a.ts"), "export const a = 1;\n");
    commitAll(repoRoot, "init");

    const agent = new CodebaseAnalystAgent(new CodebaseIndexStore(storeRoot));
    const result = await agent.execute({ id: "t1", description: "find nothing", input: { query: "nonexistent" } }, context);

    expect(result.ok).toBe(true);
    expect(result.output).toContain("No matches");
  });
});
