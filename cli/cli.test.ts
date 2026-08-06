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
import { registerCodebaseCommand } from "./commands/codebase";
import { registerGraphCommand } from "./commands/graph";
import { registerInboxCommand } from "./commands/inbox";
import { registerVaultCommand } from "./commands/vault";
import { registerProjectCommand } from "./commands/project";
import { registerLearnCommand } from "./commands/learn";
import { registerReflectCommand } from "./commands/reflect";
import { registerSearchCommand } from "./commands/search";
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

  it("provider router is disabled by default and status reflects config changes", async () => {
    const program = freshProgram();
    registerProviderCommand(program);

    await program.parseAsync(["node", "ash", "provider", "router", "status"]);
    let output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Router: disabled");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "provider", "router", "enable"]);
    await program.parseAsync(["node", "ash", "provider", "router", "set", "simple", "ollama"]);

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "provider", "router", "status"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Router: enabled");
    expect(output).toContain("simple   -> ollama");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "provider", "router", "disable"]);
    await program.parseAsync(["node", "ash", "provider", "router", "status"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Router: disabled");
  });

  it("provider router set rejects an unknown tier or provider", async () => {
    const program = freshProgram();
    registerProviderCommand(program);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "ash", "provider", "router", "set", "bogus-tier", "mock"]);
    expect(errorSpy.mock.calls.join(" ")).toContain("Unknown tier");

    errorSpy.mockClear();
    await program.parseAsync(["node", "ash", "provider", "router", "set", "simple", "does-not-exist"]);
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

  it("memory list --tag filters, and running a goal auto-records an outcome an agent never wrote itself", async () => {
    const ashos = new AshOS({ root: cwd });
    await ashos.run("say hi");

    const program = freshProgram();
    registerMemoryCommand(program);
    await program.parseAsync(["node", "ash", "memory", "list", "--tag", "outcome"]);
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain('"outcome":"success"');

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "memory", "list", "--tag", "does-not-exist-tag"]);
    expect(logSpy.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("No memory records found");
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
    for (const id of ["github-live", "hn-live", "reddit-live", "arxiv-live", "huggingface-live", "product-hunt-live"]) {
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

  it("codebase list reports nothing indexed yet", async () => {
    const program = freshProgram();
    registerCodebaseCommand(program);
    await program.parseAsync(["node", "ash", "codebase", "list"]);

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("No repositories indexed yet");
  });

  it("codebase index then find surfaces a real file written to disk", async () => {
    fs.writeFileSync(path.join(cwd, "widget.ts"), "export function buildWidget() {}\n");

    const program = freshProgram();
    registerCodebaseCommand(program);
    await program.parseAsync(["node", "ash", "codebase", "index"]);

    let output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Indexed 1 file(s)");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "codebase", "find", "buildWidget"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("widget.ts");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "codebase", "list"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("1 file(s)");
  });

  it("graph stats starts empty, then reflects real agent activity after running a goal", async () => {
    const program = freshProgram();
    registerGraphCommand(program);
    await program.parseAsync(["node", "ash", "graph", "stats"]);
    let output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("0 node(s), 0 edge(s)");

    const ashos = new AshOS({ root: cwd });
    await ashos.run("say hi");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "graph", "stats"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("agent: 1");
    expect(output).toContain("task: 1");
    expect(output).toContain("project: 1");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "graph", "nodes", "--kind", "agent"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("[agent]");
    const agentNodeId = output.split(/\s+/)[1];

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "graph", "neighbors", agentNodeId]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("produced-by");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "graph", "edges"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("produced-by");
    expect(output).toContain("part-of");
  });

  it("graph nodes reports nothing when no kind matches", async () => {
    const program = freshProgram();
    registerGraphCommand(program);
    await program.parseAsync(["node", "ash", "graph", "nodes", "--kind", "project"]);

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("No nodes recorded yet");
  });

  it("inbox list reports empty inbox, then add/list/show/archive round-trip", async () => {
    const program = freshProgram();
    registerInboxCommand(program);

    await program.parseAsync(["node", "ash", "inbox", "list"]);
    let output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Inbox is empty");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "inbox", "add", "https://github.com/anthropics/claude-code"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Captured [github-repo]");
    const id = output.trim().split(/\s+/).pop()!;

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "inbox", "list"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("[unread]");
    expect(output).toContain("[github-repo]");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "inbox", "show", id]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain(`"id": "${id}"`);

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "inbox", "archive", id]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain(`Archived ${id}`);

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "inbox", "list", "--status", "archived"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("[archived]");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "inbox", "history", id]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("version 1 of 1");
    expect(output).toContain(`"status": "unread"`);
  });

  it("inbox show reports an error for an unknown id", async () => {
    const program = freshProgram();
    registerInboxCommand(program);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await program.parseAsync(["node", "ash", "inbox", "show", "does-not-exist"]);
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("No inbox item found");
    errorSpy.mockRestore();
  });

  it("vault list reports empty vault, then add/list/show/archive round-trip", async () => {
    const program = freshProgram();
    registerVaultCommand(program);

    await program.parseAsync(["node", "ash", "vault", "list"]);
    let output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Vault is empty");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "vault", "add", "Rate limiting", "token", "bucket", "notes"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Created note");
    const id = output.trim().split(/\s+/).pop()!;

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "vault", "list"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("[active]");
    expect(output).toContain("Rate limiting");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "vault", "show", id]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain(`"id": "${id}"`);

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "vault", "archive", id]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain(`Archived ${id}`);

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "vault", "list", "--status", "archived"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("[archived]");
  });

  it("vault show reports an error for an unknown id", async () => {
    const program = freshProgram();
    registerVaultCommand(program);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await program.parseAsync(["node", "ash", "vault", "show", "does-not-exist"]);
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("No vault note found");
    errorSpy.mockRestore();
  });

  it("vault link and backlinks round-trip two notes", async () => {
    const program = freshProgram();
    registerVaultCommand(program);

    await program.parseAsync(["node", "ash", "vault", "add", "Note", "A", "content", "a"]);
    let output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    const idA = output.trim().split(/\s+/).pop()!;

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "vault", "add", "Note", "B", "content", "b"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    const idB = output.trim().split(/\s+/).pop()!;

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "vault", "link", idA, idB]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain(`Linked ${idA} -> ${idB}`);

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "vault", "backlinks", idB]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain(idA);
  });

  it("vault history reports no prior versions, then reflects an edit", async () => {
    const program = freshProgram();
    registerVaultCommand(program);

    await program.parseAsync(["node", "ash", "vault", "add", "Note", "content", "v1"]);
    const created = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    const id = created.trim().split(/\s+/).pop()!;

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "vault", "history", id]);
    let output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("No prior versions");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "vault", "archive", id]);

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "vault", "history", id]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("version 1 of 1");
    expect(output).toContain(`"status": "active"`);
  });

  it("vault promote turns an inbox item into a note and marks it reviewed", async () => {
    const program = freshProgram();
    registerInboxCommand(program);
    registerVaultCommand(program);

    await program.parseAsync(["node", "ash", "inbox", "add", "a thought worth keeping"]);
    let output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    const inboxId = output.trim().split(/\s+/).pop()!;

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "vault", "promote", inboxId]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain(`from inbox item ${inboxId}`);

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "inbox", "show", inboxId]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain(`"status": "reviewed"`);
  });

  it("vault promote reports an error for an unknown inbox id", async () => {
    const program = freshProgram();
    registerVaultCommand(program);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await program.parseAsync(["node", "ash", "vault", "promote", "does-not-exist"]);
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("not found");
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
    errorSpy.mockRestore();
  });

  it("project list reports empty, then create/list/show/archive round-trip", async () => {
    const program = freshProgram();
    registerProjectCommand(program);

    await program.parseAsync(["node", "ash", "project", "list"]);
    let output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("No projects yet");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "project", "create", "Website redesign", "--description", "Refresh the site"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Created project");
    const id = output.trim().split(/\s+/).pop()!;

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "project", "list"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("[active]");
    expect(output).toContain("Website redesign");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "project", "show", id]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain(`"id": "${id}"`);

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "project", "archive", id]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain(`Archived ${id}`);

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "project", "list", "--status", "archived"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("[archived]");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "project", "history", id]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("version 1 of 1");
    expect(output).toContain(`"status": "active"`);
  });

  it("project show reports an error for an unknown id", async () => {
    const program = freshProgram();
    registerProjectCommand(program);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await program.parseAsync(["node", "ash", "project", "show", "does-not-exist"]);
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("No project found");
    errorSpy.mockRestore();
  });

  it("project task add/list/status round-trip and drive progress", async () => {
    const program = freshProgram();
    registerProjectCommand(program);

    await program.parseAsync(["node", "ash", "project", "create", "A project"]);
    let output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    const projectId = output.trim().split(/\s+/).pop()!;

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "project", "progress", projectId]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("0% complete (0/0 tasks done)");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "project", "task", "add", projectId, "Write", "docs"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Created task");
    const taskId = output.trim().split(/\s+/).pop()!;

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "project", "task", "list", projectId]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("[todo]");
    expect(output).toContain("Write docs");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "project", "task", "status", taskId, "done"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("is now [done]");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "project", "progress", projectId]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("100% complete (1/1 tasks done)");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "project", "task", "history", taskId]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("version 1 of 1");
    expect(output).toContain(`"status": "todo"`);
  });

  it("project task add reports an error for an unknown project", async () => {
    const program = freshProgram();
    registerProjectCommand(program);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await program.parseAsync(["node", "ash", "project", "task", "add", "does-not-exist", "Write", "docs"]);
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("not found");
    process.exitCode = 0;
    errorSpy.mockRestore();
  });

  it("project milestone add/list/status round-trip", async () => {
    const program = freshProgram();
    registerProjectCommand(program);

    await program.parseAsync(["node", "ash", "project", "create", "A project"]);
    let output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    const projectId = output.trim().split(/\s+/).pop()!;

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "project", "milestone", "add", projectId, "Launch", "--due", "2026-09-01"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Created milestone");
    const milestoneId = output.trim().split(/\s+/).pop()!;

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "project", "milestone", "list", projectId]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("[pending]");
    expect(output).toContain("Launch");
    expect(output).toContain("due 2026-09-01");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "project", "milestone", "status", milestoneId, "done"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("is now [done]");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "project", "milestone", "history", milestoneId]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("version 1 of 1");
    expect(output).toContain(`"status": "pending"`);
  });

  it("learn resource list reports empty, then add/list/show/status round-trip", async () => {
    const program = freshProgram();
    registerLearnCommand(program);

    await program.parseAsync(["node", "ash", "learn", "resource", "list"]);
    let output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("No resources tracked yet");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "learn", "resource", "add", "Deep Learning Specialization", "--type", "course"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Created resource");
    const id = output.trim().split(/\s+/).pop()!;

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "learn", "resource", "list"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("[to-learn]");
    expect(output).toContain("[course]");
    expect(output).toContain("Deep Learning Specialization");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "learn", "resource", "show", id]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain(`"id": "${id}"`);

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "learn", "resource", "status", id, "completed"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("is now [completed]");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "learn", "resource", "history", id]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("version 1 of 1");
    expect(output).toContain(`"status": "to-learn"`);
  });

  it("learn resource show reports an error for an unknown id", async () => {
    const program = freshProgram();
    registerLearnCommand(program);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await program.parseAsync(["node", "ash", "learn", "resource", "show", "does-not-exist"]);
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("No resource found");
    errorSpy.mockRestore();
  });

  it("learn card add/list/review round-trip drives spaced repetition scheduling", async () => {
    const program = freshProgram();
    registerLearnCommand(program);

    await program.parseAsync(["node", "ash", "learn", "card", "list"]);
    let output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("No flashcards yet");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "learn", "card", "add", "What is SM-2?", "A spaced repetition algorithm"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Created flashcard");
    const id = output.trim().split(/\s+/).pop()!;

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "learn", "card", "list", "--due"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("What is SM-2?");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "learn", "card", "review", id, "good"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("next due");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "learn", "card", "list", "--due"]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("No cards due for review");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "learn", "card", "history", id]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("version 1 of 1");
    expect(output).toContain(`"reviewCount": 0`);
  });

  it("learn card review reports an error for an unknown id", async () => {
    const program = freshProgram();
    registerLearnCommand(program);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await program.parseAsync(["node", "ash", "learn", "card", "review", "does-not-exist", "good"]);
    expect(errorSpy.mock.calls.flat().join(" ")).toContain("not found");
    process.exitCode = 0;
    errorSpy.mockRestore();
  });

  it("innovation idea capture scores raw content into an Opportunity", async () => {
    const program = freshProgram();
    registerInnovationCommand(program);
    await program.parseAsync(["node", "ash", "innovation", "idea", "capture", "A", "tool", "that", "summarizes", "long", "PRs"]);

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Created opportunity");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "innovation", "list"]);
    const listOutput = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(listOutput).toContain("score=");
  });

  it("innovation idea capture --inbox promotes an existing inbox item and marks it reviewed", async () => {
    const program = freshProgram();
    registerInboxCommand(program);
    registerInnovationCommand(program);

    await program.parseAsync(["node", "ash", "inbox", "add", "Build a smarter changelog generator"]);
    let output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    const id = output.trim().split(/\s+/).pop()!;

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "innovation", "idea", "capture", "--inbox", id]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Created opportunity");

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "inbox", "show", id]);
    output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain(`"status": "reviewed"`);
  });

  it("innovation idea capture errors without content or --inbox", async () => {
    const program = freshProgram();
    registerInnovationCommand(program);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "ash", "innovation", "idea", "capture"]);

    expect(errorSpy.mock.calls.flat().join(" ")).toContain("Provide idea content");
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
    errorSpy.mockRestore();
  });

  it("reflect defaults to daily and reports nothing recorded when empty", async () => {
    const program = freshProgram();
    registerReflectCommand(program);
    await program.parseAsync(["node", "ash", "reflect"]);

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Reflection (daily)");
    expect(output).toContain("Nothing recorded today yet.");
  });

  it("reflect weekly reflects real inbox and outcome activity", async () => {
    const program = freshProgram();
    registerInboxCommand(program);
    registerReflectCommand(program);

    await program.parseAsync(["node", "ash", "inbox", "add", "an idea worth reviewing"]);

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "reflect", "weekly"]);
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Reflection (weekly)");
    expect(output).toContain("Inbox: 1 captured");
  });

  it("search reports no results for an empty store", async () => {
    const program = freshProgram();
    registerSearchCommand(program);
    await program.parseAsync(["node", "ash", "search", "langgraph"]);

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain('No results for "langgraph"');
  });

  it("search finds a real inbox item and a real graph node", async () => {
    const program = freshProgram();
    registerInboxCommand(program);
    registerSearchCommand(program);

    await program.parseAsync(["node", "ash", "inbox", "add", "Check out LangGraph for orchestration"]);
    const ashos = new AshOS({ root: cwd });
    ashos.knowledgeGraph.upsertNode({ kind: "technology", label: "LangGraph" });

    logSpy.mockClear();
    await program.parseAsync(["node", "ash", "search", "langgraph"]);
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("[graph]");
    expect(output).toContain("[inbox]");
  });
});
