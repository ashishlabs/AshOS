import { describe, expect, it } from "vitest";
import { CODE_PRODUCING_CAPABILITIES, TaskExecutor, VERIFICATION_CAPABILITY } from "./executor";
import { AgentRegistry } from "../agents/registry";
import { ToolRegistry } from "../tools/registry";
import { MockProvider } from "../providers/mock-provider";
import type { Agent, AgentContext, AgentResult, AgentTask } from "../agents/types";

class StubAgent implements Agent {
  name: string;
  description = "stub";
  capabilities: string[];
  calls: AgentTask[] = [];

  constructor(name: string, capabilities: string[], private result: AgentResult) {
    this.name = name;
    this.capabilities = capabilities;
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    this.calls.push(task);
    return this.result;
  }
}

function makeContext(): AgentContext {
  return { provider: new MockProvider(), tools: new ToolRegistry(), cwd: process.cwd() };
}

describe("TaskExecutor — verification gate", () => {
  it("runs the verify-capability agent after a code-producing task succeeds", async () => {
    const codeAgent = new StubAgent("code-agent", ["code"], { ok: true, output: "done" });
    const verifyAgent = new StubAgent("verify-agent", [VERIFICATION_CAPABILITY], { ok: true, output: "passed" });
    const agents = new AgentRegistry();
    agents.register(codeAgent);
    agents.register(verifyAgent);

    const executor = new TaskExecutor({ agents, agentContext: makeContext() });
    const results = await executor.execute({
      goal: "g",
      tasks: [{ id: "a", title: "Write code", description: "write it", capability: "code" }]
    });

    expect(results.get("a")?.status).toBe("success");
    expect(verifyAgent.calls).toHaveLength(1);
  });

  it("fails the task when verification fails", async () => {
    const codeAgent = new StubAgent("code-agent", ["code"], { ok: true, output: "done" });
    const verifyAgent = new StubAgent("verify-agent", [VERIFICATION_CAPABILITY], { ok: false, error: "tests red" });
    const agents = new AgentRegistry();
    agents.register(codeAgent);
    agents.register(verifyAgent);

    const executor = new TaskExecutor({ agents, agentContext: makeContext(), retries: 0 });
    const results = await executor.execute({
      goal: "g",
      tasks: [{ id: "a", title: "Write code", description: "write it", capability: "code" }]
    });

    expect(results.get("a")?.status).toBe("failed");
    expect(results.get("a")?.error).toContain("tests red");
  });

  it("skips verification for non-code-producing capabilities", async () => {
    const genericAgent = new StubAgent("generic-agent", ["generic"], { ok: true, output: "done" });
    const verifyAgent = new StubAgent("verify-agent", [VERIFICATION_CAPABILITY], { ok: true, output: "passed" });
    const agents = new AgentRegistry();
    agents.register(genericAgent);
    agents.register(verifyAgent);

    const executor = new TaskExecutor({ agents, agentContext: makeContext() });
    const results = await executor.execute({
      goal: "g",
      tasks: [{ id: "a", title: "Do a thing", description: "do it", capability: "generic" }]
    });

    expect(results.get("a")?.status).toBe("success");
    expect(verifyAgent.calls).toHaveLength(0);
  });

  it("succeeds without running verification when no verify-capability agent is registered", async () => {
    const codeAgent = new StubAgent("code-agent", ["code"], { ok: true, output: "done" });
    const agents = new AgentRegistry();
    agents.register(codeAgent);

    const executor = new TaskExecutor({ agents, agentContext: makeContext() });
    const results = await executor.execute({
      goal: "g",
      tasks: [{ id: "a", title: "Write code", description: "write it", capability: "code" }]
    });

    expect(results.get("a")?.status).toBe("success");
  });

  it("skips verification entirely when verify: false is set", async () => {
    const codeAgent = new StubAgent("code-agent", ["code"], { ok: true, output: "done" });
    const verifyAgent = new StubAgent("verify-agent", [VERIFICATION_CAPABILITY], { ok: false, error: "would fail" });
    const agents = new AgentRegistry();
    agents.register(codeAgent);
    agents.register(verifyAgent);

    const executor = new TaskExecutor({ agents, agentContext: makeContext(), verify: false });
    const results = await executor.execute({
      goal: "g",
      tasks: [{ id: "a", title: "Write code", description: "write it", capability: "code" }]
    });

    expect(results.get("a")?.status).toBe("success");
    expect(verifyAgent.calls).toHaveLength(0);
  });

  it("exposes CODE_PRODUCING_CAPABILITIES as an extensible list including code", () => {
    expect(CODE_PRODUCING_CAPABILITIES).toContain("code");
  });
});
