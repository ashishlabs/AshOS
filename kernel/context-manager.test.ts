import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ContextManager } from "./context-manager";

describe("ContextManager", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-context-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("detects the project root and name from package.json", () => {
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "my-project" }));
    const ctx = new ContextManager(root);
    const project = ctx.detectProject();

    expect(project.root).toBe(root);
    expect(project.name).toBe("my-project");
    expect(project.gitRepo).toBe(false);
  });

  it("detects a git repo and package manager from lockfiles", () => {
    fs.mkdirSync(path.join(root, ".git"));
    fs.writeFileSync(path.join(root, "package-lock.json"), "{}");
    const ctx = new ContextManager(root);
    const project = ctx.detectProject();

    expect(project.gitRepo).toBe(true);
    expect(project.packageManager).toBe("npm");
  });

  it("falls back to the directory name when there is no package.json", () => {
    const nested = path.join(root, "no-manifest-here");
    fs.mkdirSync(nested);
    const ctx = new ContextManager(nested);
    const project = ctx.detectProject();

    expect(project.name).toBe(path.basename(nested));
    expect(project.packageManager).toBe("unknown");
  });

  it("ignores a malformed package.json instead of throwing", () => {
    fs.writeFileSync(path.join(root, "package.json"), "{ not valid json");
    const ctx = new ContextManager(root);
    expect(() => ctx.detectProject()).not.toThrow();
  });

  it("tracks active files and notes", () => {
    const ctx = new ContextManager(root);
    ctx.addActiveFile("src/a.ts");
    ctx.addActiveFile("src/b.ts");
    expect(ctx.getActiveFiles().sort()).toEqual(["src/a.ts", "src/b.ts"]);

    ctx.removeActiveFile("src/a.ts");
    expect(ctx.getActiveFiles()).toEqual(["src/b.ts"]);

    ctx.addNote("remember to update the changelog");
    expect(ctx.getNotes()).toEqual(["remember to update the changelog"]);
  });
});
