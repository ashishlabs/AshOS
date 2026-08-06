import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
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
import { DocumentationAgent } from "./documentation-agent";
import { AgentRegistry } from "./registry";
import { ToolRegistry } from "../tools/registry";
import { FsTool } from "../tools/fs-tool";
import { ShellTool } from "../tools/shell-tool";
import { GitTool } from "../tools/git-tool";
import { WebFetchTool } from "../tools/web-fetch-tool";
import { MockProvider } from "../providers/mock-provider";
import type { AgentContext } from "./types";

function htmlResponse(html: string, opts: { status?: number } = {}) {
  return {
    ok: (opts.status ?? 200) < 400,
    status: opts.status ?? 200,
    headers: { get: (key: string) => (key.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null) },
    text: async () => html
  };
}

const PUBLIC_IP = async () => "93.184.216.34"; // example.com's real (public) IP — a stand-in resolver for tests

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
    vi.unstubAllGlobals();
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

  it("ResearchAgent grounds the summary in a URL's fetched content via the web-fetch tool", async () => {
    context.tools.register(new WebFetchTool({ resolveHostname: PUBLIC_IP }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        htmlResponse("<html><head><title>AshOS Docs</title></head><body><p>AshOS is a local-first AI operating system.</p></body></html>")
      )
    );

    const agent = new ResearchAgent();
    const result = await agent.execute({ id: "t4b", description: "Summarize https://example.com/about" }, context);

    expect(result.ok).toBe(true);
    expect(result.output).toContain("AshOS is a local-first AI operating system.");
  });

  it("ResearchAgent falls back to model knowledge when the URL fetch fails", async () => {
    context.tools.register(new WebFetchTool({ resolveHostname: PUBLIC_IP }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse("", { status: 500 })));

    const agent = new ResearchAgent();
    const result = await agent.execute({ id: "t4c", description: "Summarize https://example.com/about" }, context);

    expect(result.ok).toBe(true);
    expect(result.output).toContain("no web search tool available");
  });

  it("ResearchAgent doesn't attempt a fetch when the description has no URL, even with web-fetch registered", async () => {
    context.tools.register(new WebFetchTool({ resolveHostname: PUBLIC_IP }));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const agent = new ResearchAgent();
    const result = await agent.execute({ id: "t4d", description: "AshOS architecture" }, context);

    expect(result.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
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

  it("DocumentationAgent documents a single file, grounded in its real content, and writes the result to disk", async () => {
    const file = path.join(cwd, "widget.ts");
    fs.writeFileSync(file, "export function widget(name: string) { return `hello ${name}`; }");
    const agent = new DocumentationAgent();
    const result = await agent.execute({ id: "t13", description: "document widget.ts", input: { file } }, context);

    expect(result.ok).toBe(true);
    expect(result.output).toContain(file);
    expect(result.output).toContain("export function widget");
    const data = result.data as { target: string; outputFile: string };
    expect(data.target).toBe(file);
    expect(data.outputFile).toBe(path.join(cwd, ".ashos", "generated-docs", "widget.md"));
    expect(fs.existsSync(data.outputFile)).toBe(true);
    expect(fs.readFileSync(data.outputFile, "utf-8")).toBe(result.output);
  });

  it("DocumentationAgent documents a module directory from its file/symbol structure", async () => {
    fs.mkdirSync(path.join(cwd, "widgets"));
    fs.writeFileSync(path.join(cwd, "widgets", "a.ts"), "export function makeWidget() { return 1; }");
    fs.writeFileSync(path.join(cwd, "widgets", "b.ts"), "export class WidgetStore {}");

    const agent = new DocumentationAgent();
    const result = await agent.execute({ id: "t14", description: "document the widgets module", input: { dir: "widgets" } }, context);

    expect(result.ok).toBe(true);
    expect(result.output).toContain("widgets/a.ts");
    expect(result.output).toContain("makeWidget");
    expect(result.output).toContain("WidgetStore");
    const data = result.data as { target: string; outputFile: string };
    expect(data.outputFile).toBe(path.join(cwd, ".ashos", "generated-docs", "widgets.md"));
  });

  it("DocumentationAgent writes to an explicit outputFile when given one", async () => {
    const file = path.join(cwd, "widget.ts");
    fs.writeFileSync(file, "export function widget() {}");
    const outputFile = path.join(cwd, "custom-docs", "widget-doc.md");

    const agent = new DocumentationAgent();
    const result = await agent.execute({ id: "t15", description: "document it", input: { file, outputFile } }, context);

    expect(result.ok).toBe(true);
    expect(fs.existsSync(outputFile)).toBe(true);
    expect(fs.existsSync(path.join(cwd, ".ashos", "generated-docs"))).toBe(false);
  });

  it("DocumentationAgent requires exactly one of input.file or input.dir", async () => {
    const agent = new DocumentationAgent();
    const neither = await agent.execute({ id: "t16", description: "document something" }, context);
    expect(neither.ok).toBe(false);

    fs.mkdirSync(path.join(cwd, "widgets"));
    const both = await agent.execute(
      { id: "t17", description: "document something", input: { file: path.join(cwd, "widget.ts"), dir: "widgets" } },
      context
    );
    expect(both.ok).toBe(false);
  });

  it("DocumentationAgent fails cleanly when the given file doesn't exist", async () => {
    const agent = new DocumentationAgent();
    const result = await agent.execute({ id: "t18", description: "document it", input: { file: path.join(cwd, "missing.ts") } }, context);
    expect(result.ok).toBe(false);
  });

  it("DocumentationAgent fails cleanly when the given directory has no source files", async () => {
    fs.mkdirSync(path.join(cwd, "empty"));
    const agent = new DocumentationAgent();
    const result = await agent.execute({ id: "t19", description: "document it", input: { dir: "empty" } }, context);
    expect(result.ok).toBe(false);
  });

  it("DocumentationAgent registers under the 'documentation' capability", () => {
    const registry = new AgentRegistry();
    registry.register(new DocumentationAgent());
    expect(registry.findByCapability("documentation")?.name).toBe("documentation");
    expect(registry.findByCapability("docs")?.name).toBe("documentation");
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
