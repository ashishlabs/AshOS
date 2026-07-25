import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PermissionManager } from "./permission-manager";

describe("PermissionManager", () => {
  let dir: string;
  let storePath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-perm-"));
    storePath = path.join(dir, "permissions.json");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("allows safe actions without prompting", async () => {
    const manager = new PermissionManager(storePath);
    const allowed = await manager.check({ actor: "tool:shell", action: "ls -la", reason: "" });
    expect(allowed).toBe(true);
  });

  it("denies dangerous actions by default when no prompter is set", async () => {
    const manager = new PermissionManager(storePath);
    const allowed = await manager.check({ actor: "tool:shell", action: "rm -rf /tmp/foo", reason: "" });
    expect(allowed).toBe(false);
  });

  it("respects prompter decisions and persists always-allow", async () => {
    const manager = new PermissionManager(storePath);
    manager.setPrompter(() => "always-allow");

    const first = await manager.check({ actor: "tool:git", action: "git push origin main", reason: "" });
    expect(first).toBe(true);

    // A fresh manager reading the same store should honor the persisted decision
    const manager2 = new PermissionManager(storePath);
    let promptCalled = false;
    manager2.setPrompter(() => {
      promptCalled = true;
      return "deny";
    });
    const second = await manager2.check({ actor: "tool:git", action: "git push origin main", reason: "" });
    expect(second).toBe(true);
    expect(promptCalled).toBe(false);
  });

  it("classifies dangerous patterns", () => {
    expect(PermissionManager.isDangerous("rm -rf node_modules").dangerous).toBe(true);
    expect(PermissionManager.isDangerous("npm install").dangerous).toBe(false);
  });
});
