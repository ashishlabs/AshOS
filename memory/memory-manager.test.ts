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

  it("has no revisions for a key that's never been overwritten", async () => {
    const manager = new MemoryManager(root, { globalDir: path.join(root, "g") });
    await manager.remember("project", "note-1", { text: "v1" });
    expect(manager.revisions("project", "note-1")).toEqual([]);
  });

  it("snapshots the old value into revisions when a project key is overwritten", async () => {
    const manager = new MemoryManager(root, { globalDir: path.join(root, "g") });
    await manager.remember("project", "note-1", { text: "v1" }, { tags: ["vault"] });
    await manager.remember("project", "note-1", { text: "v2" }, { tags: ["vault"] });

    const revisions = manager.revisions("project", "note-1");
    expect(revisions).toHaveLength(1);
    expect(revisions[0].value).toEqual({ text: "v1" });
    expect(revisions[0].tags).toEqual(["vault"]);
    expect(revisions[0].scope).toBe("project");
    expect(revisions[0].key).toBe("note-1");

    expect(manager.recall("project", "note-1")?.value).toEqual({ text: "v2" });
  });

  it("accumulates multiple revisions, newest first", async () => {
    const manager = new MemoryManager(root, { globalDir: path.join(root, "g") });
    await manager.remember("project", "note-1", { text: "v1" });
    await manager.remember("project", "note-1", { text: "v2" });
    await manager.remember("project", "note-1", { text: "v3" });

    const revisions = manager.revisions("project", "note-1");
    expect(revisions.map((r) => r.value)).toEqual([{ text: "v2" }, { text: "v1" }]);
    expect(manager.recall("project", "note-1")?.value).toEqual({ text: "v3" });
  });

  it("tracks revisions for global scope independently from project scope", async () => {
    const manager = new MemoryManager(root, { globalDir: path.join(root, "g") });
    await manager.remember("global", "note-1", { text: "g1" });
    await manager.remember("global", "note-1", { text: "g2" });
    await manager.remember("project", "note-1", { text: "p1" });
    await manager.remember("project", "note-1", { text: "p2" });

    expect(manager.revisions("global", "note-1")).toHaveLength(1);
    expect(manager.revisions("global", "note-1")[0].value).toEqual({ text: "g1" });
    expect(manager.revisions("project", "note-1")).toHaveLength(1);
    expect(manager.revisions("project", "note-1")[0].value).toEqual({ text: "p1" });
  });

  it("does not track revisions for short-term or session scopes", async () => {
    const manager = new MemoryManager(root, { globalDir: path.join(root, "g") });
    await manager.remember("session", "k", "v1");
    await manager.remember("session", "k", "v2");
    await manager.remember("short-term", "k", "v1");
    await manager.remember("short-term", "k", "v2");

    expect(manager.revisions("project", "k")).toEqual([]);
    expect(manager.revisions("global", "k")).toEqual([]);
  });

  it("persists revisions across manager instances", async () => {
    const globalDir = path.join(root, "global-home");
    const manager = new MemoryManager(root, { globalDir });
    await manager.remember("project", "note-1", { text: "v1" });
    await manager.remember("project", "note-1", { text: "v2" });

    const manager2 = new MemoryManager(root, { globalDir });
    expect(manager2.revisions("project", "note-1")).toHaveLength(1);
    expect(manager2.revisions("project", "note-1")[0].value).toEqual({ text: "v1" });
  });

  it("forget() clears revision history for that key too", async () => {
    const manager = new MemoryManager(root, { globalDir: path.join(root, "g") });
    await manager.remember("project", "note-1", { text: "v1" });
    await manager.remember("project", "note-1", { text: "v2" });
    expect(manager.revisions("project", "note-1")).toHaveLength(1);

    manager.forget("project", "note-1");
    expect(manager.revisions("project", "note-1")).toEqual([]);
  });
});
