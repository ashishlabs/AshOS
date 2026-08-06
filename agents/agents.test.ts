import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CodeAgent } from "./code-agent";
import { GitAgent } from "./git-agent";
import { TestingAgent } from "./testing-agent";
import { ResearchAgent } from "./research-agent";
import { ReviewerAgent } from "./reviewer-agent";
import { SecurityAuditorAgent } from "./security-auditor-agent";
import { DevOpsAgent } from "./devops-agent";
import { UIDesignerAgent } from "./ui-designer-agent";
import { ArchitectAgent } from "./architect-agent";
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

  it("ReviewerAgent reviews a task description directly when no file is given", async () => {
    const agent = new ReviewerAgent();
    const result = await agent.execute({ id: "t5", description: "review this pasted diff" }, context);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("review this pasted diff");
  });

  it("ReviewerAgent reads a file's content for context when given input.file", async () => {
    const file = path.join(cwd, "review-me.ts");
    fs.writeFileSync(file, "export function add(a: number, b: number) { return a + b; }");
    const agent = new ReviewerAgent();
    const result = await agent.execute({ id: "t6", description: "review it", input: { file } }, context);
    expect(result.ok).toBe(true);
    expect(result.output).toContain(file);
    expect(result.output).toContain("export function add");
  });

  it("ReviewerAgent fails cleanly when the given file doesn't exist", async () => {
    const agent = new ReviewerAgent();
    const result = await agent.execute({ id: "t7", description: "review it", input: { file: path.join(cwd, "missing.ts") } }, context);
    expect(result.ok).toBe(false);
  });

  it("SecurityAuditorAgent audits a task description", async () => {
    const agent = new SecurityAuditorAgent();
    const result = await agent.execute({ id: "t8", description: "audit this login handler" }, context);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("audit this login handler");
  });

  it("DevOpsAgent returns generated content when no target file is given", async () => {
    const agent = new DevOpsAgent();
    const result = await agent.execute({ id: "t9", description: "write a Dockerfile for a Node app" }, context);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("write a Dockerfile");
  });

  it("DevOpsAgent writes generated content to a file when given input.file", async () => {
    const agent = new DevOpsAgent();
    const file = path.join(cwd, "Dockerfile");
    const result = await agent.execute({ id: "t10", description: "write a Dockerfile", input: { file } }, context);
    expect(result.ok).toBe(true);
    expect(fs.existsSync(file)).toBe(true);
  });

  it("UIDesignerAgent proposes structure for a described feature", async () => {
    const agent = new UIDesignerAgent();
    const result = await agent.execute({ id: "t11", description: "a settings page with a dark mode toggle" }, context);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("a settings page with a dark mode toggle");
  });

  it("ArchitectAgent proposes tradeoffs for a described system", async () => {
    const agent = new ArchitectAgent();
    const result = await agent.execute({ id: "t12", description: "a rate limiter shared across services" }, context);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("a rate limiter shared across services");
  });

  it("AgentRegistry finds agents by capability", () => {
    const registry = new AgentRegistry();
    registry.register(new CodeAgent());
    registry.register(new GitAgent());
    expect(registry.findByCapability("git")?.name).toBe("git");
    expect(registry.list()).toHaveLength(2);
  });

  it("the five specialist agents each register under a distinct capability", () => {
    const registry = new AgentRegistry();
    registry.register(new ReviewerAgent());
    registry.register(new SecurityAuditorAgent());
    registry.register(new DevOpsAgent());
    registry.register(new UIDesignerAgent());
    registry.register(new ArchitectAgent());
    expect(registry.findByCapability("review")?.name).toBe("reviewer");
    expect(registry.findByCapability("security-audit")?.name).toBe("security-auditor");
    expect(registry.findByCapability("devops")?.name).toBe("devops");
    expect(registry.findByCapability("ui-design")?.name).toBe("ui-designer");
    expect(registry.findByCapability("architecture")?.name).toBe("architect");
  });
});
