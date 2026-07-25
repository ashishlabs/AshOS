import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ToolRegistry } from "./registry";
import { FsTool } from "./fs-tool";
import { ShellTool } from "./shell-tool";
import { PermissionManager } from "../kernel/permission-manager";

describe("ToolRegistry + FsTool + ShellTool", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-tools-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("registers and retrieves tools by name", () => {
    const registry = new ToolRegistry();
    registry.register(new FsTool());
    expect(registry.get("fs")).toBeDefined();
    expect(registry.list()).toHaveLength(1);
  });

  it("writes and reads files via FsTool", async () => {
    const tool = new FsTool();
    const file = path.join(dir, "note.txt");
    const write = await tool.execute({ action: "write", args: { path: file, content: "hello" } });
    expect(write.ok).toBe(true);
    const read = await tool.execute({ action: "read", args: { path: file } });
    expect(read.output).toBe("hello");
  });

  it("runs healthCheckAll across registered tools", async () => {
    const registry = new ToolRegistry();
    registry.register(new FsTool());
    const health = await registry.healthCheckAll();
    expect(health.fs.healthy).toBe(true);
  });

  it("blocks dangerous shell commands without a permission prompter", async () => {
    const permStore = path.join(dir, "permissions.json");
    const tool = new ShellTool(new PermissionManager(permStore));
    const result = await tool.execute({ action: "run", args: { command: "rm -rf /tmp/should-not-run" } });
    expect(result.ok).toBe(false);
  });

  it("allows safe shell commands", async () => {
    const tool = new ShellTool();
    const result = await tool.execute({ action: "run", args: { command: "echo hi" } });
    expect(result.ok).toBe(true);
    expect(result.output?.trim()).toBe("hi");
  });
});
