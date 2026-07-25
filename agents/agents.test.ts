import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CodeAgent } from "./code-agent";
import { GitAgent } from "./git-agent";
import { TestingAgent } from "./testing-agent";
import { ResearchAgent } from "./research-agent";
import { AgentRegistry } from "./registry";
import { ToolRegistry } from "../tools/registry";
import { FsTool } from "../tools/fs-tool";
import { ShellTool } from "../tools/shell-tool";
import { GitTool } from "../tools/git-tool";
import { MockProvider } from "../providers/mock-provider";
import type { AgentContext } from "./types";

describe("Agents", () => {
  let cwd: string;
  let context: AgentContext;

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-agents-"));
    const tools = new ToolRegistry();
    tools.register(new FsTool());
    tools.register(new ShellTool());
    tools.register(new GitTool());
    context = { provider: new MockProvider(), tools, cwd };
  });

  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it("CodeAgent writes generated content to a file", async () => {
    const agent = new CodeAgent();
    const file = path.join(cwd, "out.ts");
    const result = await agent.execute({ id: "t1", description: "write a hello function", input: { file } }, context);
    expect(result.ok).toBe(true);
    expect(fs.existsSync(file)).toBe(true);
  });

  it("GitAgent reports status via the git tool", async () => {
    await context.tools.get("shell")?.execute({ action: "run", args: { command: "git init", cwd } });
    const agent = new GitAgent();
    const result = await agent.execute({ id: "t2", description: "check status", input: { action: "status" } }, context);
    expect(result.ok).toBe(true);
  });

  it("TestingAgent surfaces failures from the shell tool", async () => {
    const agent = new TestingAgent();
    const result = await agent.execute({ id: "t3", description: "run tests", input: { command: "exit 1" } }, context);
    expect(result.ok).toBe(false);
  });

  it("ResearchAgent returns a summary from the provider", async () => {
    const agent = new ResearchAgent();
    const result = await agent.execute({ id: "t4", description: "AshOS architecture" }, context);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("mock");
  });

  it("AgentRegistry finds agents by capability", () => {
    const registry = new AgentRegistry();
    registry.register(new CodeAgent());
    registry.register(new GitAgent());
    expect(registry.findByCapability("git")?.name).toBe("git");
    expect(registry.list()).toHaveLength(2);
  });
});
