import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { registerInitCommand } from "./commands/init";
import { registerStatusCommand } from "./commands/status";
import { registerDoctorCommand } from "./commands/doctor";
import { registerPlanCommand } from "./commands/plan";
import { registerRunCommand } from "./commands/run";
import { registerProviderCommand } from "./commands/provider";
import { registerMemoryCommand } from "./commands/memory";
import { isInitialized, configPath } from "../kernel/config";
import { AshOS } from "../sdk/ashos";

function freshProgram(): Command {
  const program = new Command();
  program.exitOverride();
  return program;
}

describe("CLI commands", () => {
  let cwd: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalCwd = process.cwd();
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-cli-"));
    process.chdir(cwd);
    process.env.ASHOS_PROVIDER = "mock";
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(cwd, { recursive: true, force: true });
    logSpy.mockRestore();
  });

  it("init writes .ashos/config.json with the requested provider", async () => {
    const program = freshProgram();
    registerInitCommand(program);
    await program.parseAsync(["node", "ash", "init", "--provider", "mock"]);

    expect(isInitialized(cwd)).toBe(true);
    const config = JSON.parse(fs.readFileSync(configPath(cwd), "utf-8"));
    expect(config.provider).toBe("mock");
  });

  it("init does not overwrite an existing config without --force", async () => {
    const program = freshProgram();
    registerInitCommand(program);
    await program.parseAsync(["node", "ash", "init", "--provider", "mock"]);
    await program.parseAsync(["node", "ash", "init", "--provider", "anthropic"]);

    const config = JSON.parse(fs.readFileSync(configPath(cwd), "utf-8"));
    expect(config.provider).toBe("mock");
  });

  it("status reports the active provider and registered agents/tools", async () => {
    const program = freshProgram();
    registerStatusCommand(program);
    await program.parseAsync(["node", "ash", "status"]);

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Active provider: mock");
    expect(output).toContain("generic");
    expect(output).toContain("shell");
  });

  it("doctor checks tool health and provider connectivity", async () => {
    const program = freshProgram();
    registerDoctorCommand(program);
    await program.parseAsync(["node", "ash", "doctor"]);

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("tool:fs");
    expect(output).toContain("reachable");
  });

  it("plan prints a task graph without executing it", async () => {
    const program = freshProgram();
    registerPlanCommand(program);
    await program.parseAsync(["node", "ash", "plan", "Add", "a", "health", "check"]);

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Goal: Add a health check");
    expect(output).toContain("[generic]");
  });

  it("run plans and executes a goal end to end", async () => {
    const program = freshProgram();
    registerRunCommand(program);
    await program.parseAsync(["node", "ash", "run", "Ship", "a", "feature"]);

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("✔");
  });

  it("provider list marks the active provider and set updates config", async () => {
    const program = freshProgram();
    registerInitCommand(program);
    registerProviderCommand(program);
    await program.parseAsync(["node", "ash", "init"]);

    await program.parseAsync(["node", "ash", "provider", "list"]);
    let output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("* mock");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "provider", "set", "ollama"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain('set to "ollama"');
    const config = JSON.parse(fs.readFileSync(configPath(cwd), "utf-8"));
    expect(config.provider).toBe("ollama");
  });

  it("provider set rejects an unknown provider name", async () => {
    const program = freshProgram();
    registerProviderCommand(program);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "ash", "provider", "set", "does-not-exist"]);

    expect(errorSpy.mock.calls.join(" ")).toContain("Unknown provider");
    errorSpy.mockRestore();
  });

  it("memory list and forget round-trip a record written via the SDK", async () => {
    const ashos = new AshOS({ root: cwd });
    await ashos.memory.remember("project", "cli-note", "written by the sdk");

    const program = freshProgram();
    registerMemoryCommand(program);
    await program.parseAsync(["node", "ash", "memory", "list", "--scope", "project"]);
    let output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("cli-note");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "memory", "forget", "project", "cli-note"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Forgot project/cli-note");
    expect(ashos.memory.recall("project", "cli-note")).toBeUndefined();
  });
});
