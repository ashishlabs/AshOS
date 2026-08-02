import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CodebaseIndexStore } from "./codebase-store";
import type { CodebaseIndex } from "./types";

function makeIndex(root: string, overrides: Partial<CodebaseIndex> = {}): CodebaseIndex {
  return { root, commitHash: "abc123", fileCount: 1, files: [], modules: [], indexedAt: "2026-08-02T00:00:00Z", ...overrides };
}

describe("CodebaseIndexStore", () => {
  let projectRoot: string;
  let store: CodebaseIndexStore;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-codebase-store-"));
    store = new CodebaseIndexStore(projectRoot);
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it("returns undefined for a root that has never been indexed", () => {
    expect(store.get("/some/repo")).toBeUndefined();
  });

  it("round-trips save/get by indexed root", () => {
    const index = makeIndex("/some/repo");
    store.save(index);
    expect(store.get("/some/repo")).toEqual(index);
  });

  it("slugs a path into a filesystem-safe key", () => {
    expect(store.slug("/some/repo")).not.toContain("/");
  });

  it("distinguishes two different indexed roots", () => {
    store.save(makeIndex("/repo-a"));
    store.save(makeIndex("/repo-b", { commitHash: "def456" }));

    expect(store.get("/repo-a")!.commitHash).toBe("abc123");
    expect(store.get("/repo-b")!.commitHash).toBe("def456");
  });

  it("list returns every indexed repository", () => {
    expect(store.list()).toEqual([]);
    store.save(makeIndex("/repo-a"));
    store.save(makeIndex("/repo-b"));
    expect(store.list()).toHaveLength(2);
  });

  it("overwrites the previous index for the same root", () => {
    store.save(makeIndex("/repo-a", { fileCount: 1 }));
    store.save(makeIndex("/repo-a", { fileCount: 5 }));
    expect(store.list()).toHaveLength(1);
    expect(store.get("/repo-a")!.fileCount).toBe(5);
  });
});
