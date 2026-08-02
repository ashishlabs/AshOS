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
import { registerInnovationCommand } from "./commands/innovation";
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

  it("innovation collectors lists one collector per default domain", async () => {
    const program = freshProgram();
    registerInnovationCommand(program);
    await program.parseAsync(["node", "ash", "innovation", "collectors"]);

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("mock-market");
    expect(output).toContain("mock-github");
  });

  it("innovation list reports nothing discovered yet before any cycle runs", async () => {
    const program = freshProgram();
    registerInnovationCommand(program);
    await program.parseAsync(["node", "ash", "innovation", "list"]);

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("No opportunities discovered yet");
  });

  it("innovation discover then list surfaces the resulting opportunities", async () => {
    const program = freshProgram();
    registerInnovationCommand(program);
    await program.parseAsync(["node", "ash", "innovation", "discover", "--domains", "market"]);

    let output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Captured");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "innovation", "list"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("score=");
  });

  it("innovation show reports an error for an unknown opportunity id", async () => {
    const program = freshProgram();
    registerInnovationCommand(program);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "ash", "innovation", "show", "does-not-exist"]);

    expect(errorSpy.mock.calls.join(" ")).toContain("not found");
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
    errorSpy.mockRestore();
  });

  it("innovation brief works even with nothing discovered yet", async () => {
    const program = freshProgram();
    registerInnovationCommand(program);
    await program.parseAsync(["node", "ash", "innovation", "brief"]);

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Daily Innovation Brief");
  });

  it("innovation profile reflects tags observed during discovery", async () => {
    const program = freshProgram();
    registerInnovationCommand(program);
    await program.parseAsync(["node", "ash", "innovation", "discover", "--domains", "market"]);

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "innovation", "profile"]);
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("weight=");
  });

  it("innovation collectors also lists every opt-in live collector", async () => {
    const program = freshProgram();
    registerInnovationCommand(program);
    await program.parseAsync(["node", "ash", "innovation", "collectors"]);

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    for (const id of ["github-live", "hn-live", "reddit-live", "arxiv-live", "huggingface-live"]) {
      expect(output).toContain(id);
    }
    expect(output).toContain("opt-in via --live");
  });

  it("innovation events reports nothing yet, then lists canonical events after a discovery cycle", async () => {
    const program = freshProgram();
    registerInnovationCommand(program);
    await program.parseAsync(["node", "ash", "innovation", "events"]);
    expect(logSpy.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("No events recorded yet");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "innovation", "discover", "--domains", "market"]);

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "innovation", "events"]);
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("confidence=");
  });

  it("innovation repo list reports nothing analyzed yet", async () => {
    const program = freshProgram();
    registerInnovationCommand(program);
    await program.parseAsync(["node", "ash", "innovation", "repo", "list"]);

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("No repositories analyzed yet");
  });

  it("innovation radar reports nothing tracked before any discovery, then classifies after --refresh", async () => {
    const program = freshProgram();
    registerInnovationCommand(program);
    await program.parseAsync(["node", "ash", "innovation", "radar"]);
    expect(logSpy.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("No technologies tracked yet");

    await program.parseAsync(["node", "ash", "innovation", "discover", "--domains", "market"]);

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "innovation", "radar", "--refresh"]);
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Radar:");
    expect(output).toMatch(/\[(emerging|growing|stable|declining|obsolete)\]/);
  });
});
