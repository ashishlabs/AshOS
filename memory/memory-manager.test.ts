import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryManager } from "./memory-manager";

describe("MemoryManager", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-memory-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("persists project memory across manager instances", async () => {
    const globalDir = path.join(root, "global-home");
    const manager = new MemoryManager(root, { globalDir });
    await manager.remember("project", "architecture", { style: "modular" });

    const manager2 = new MemoryManager(root, { globalDir });
    expect(manager2.recall("project", "architecture")?.value).toEqual({ style: "modular" });
  });

  it("keeps short-term memory in-process and expires it via ttl", async () => {
    const manager = new MemoryManager(root, { globalDir: path.join(root, "g") });
    await manager.remember("short-term", "temp", "value", { ttlMs: 10 });
    expect(manager.recall("short-term", "temp")?.value).toBe("value");
    await new Promise((r) => setTimeout(r, 30));
    expect(manager.recall("short-term", "temp")).toBeUndefined();
  });

  it("queries by tag and text across scopes", async () => {
    const manager = new MemoryManager(root, { globalDir: path.join(root, "g") });
    await manager.remember("project", "bug-1", "login button broken", { tags: ["bug"] });
    await manager.remember("project", "todo-1", "write docs", { tags: ["todo"] });

    expect(manager.query({ tag: "bug" })).toHaveLength(1);
    expect(manager.query({ text: "docs" })).toHaveLength(1);
  });

  it("forgets records", async () => {
    const manager = new MemoryManager(root, { globalDir: path.join(root, "g") });
    await manager.remember("session", "k", "v");
    manager.forget("session", "k");
    expect(manager.recall("session", "k")).toBeUndefined();
  });
});
