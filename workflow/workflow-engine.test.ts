import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WorkflowEngine } from "./workflow-engine";
import { AgentRegistry } from "../agents/registry";
import { GenericAgent } from "../agents/generic-agent";
import { ToolRegistry } from "../tools/registry";
import { FsTool } from "../tools/fs-tool";
import { MockProvider } from "../providers/mock-provider";

describe("WorkflowEngine", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-workflow-"));
  });

  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it("runs a mixed tool + agent workflow respecting dependencies", async () => {
    const tools = new ToolRegistry();
    tools.register(new FsTool());
    const agents = new AgentRegistry();
    agents.register(new GenericAgent());

    const engine = new WorkflowEngine({
      agents,
      tools,
      agentContext: { provider: new MockProvider(), tools, cwd }
    });

    const file = path.join(cwd, "note.txt");
    const results = await engine.run({
      name: "demo",
      steps: [
        { id: "write", uses: "tool:fs", action: "write", params: { path: file, content: "hi" } },
        { id: "summarize", uses: "agent:generic", dependsOn: ["write"], params: { description: "summarize the note" } }
      ]
    });

    expect(results.get("write")?.status).toBe("success");
    expect(results.get("summarize")?.status).toBe("success");
  });

  it("loads a workflow definition from a JSON file", () => {
    const file = path.join(cwd, "wf.json");
    fs.writeFileSync(file, JSON.stringify({ name: "loaded", steps: [] }));
    const def = WorkflowEngine.loadDefinition(file);
    expect(def.name).toBe("loaded");
  });
});
