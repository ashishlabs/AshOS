import { describe, expect, it } from "vitest";
import { Planner } from "./planner";
import { TaskExecutor } from "./executor";
import { AgentRegistry } from "../agents/registry";
import { GenericAgent } from "../agents/generic-agent";
import { ToolRegistry } from "../tools/registry";
import type { AIProvider } from "../providers/types";
import { MockProvider } from "../providers/mock-provider";

class ScriptedProvider extends MockProvider implements AIProvider {
  constructor(private response: string) {
    super();
  }
  async chat() {
    return { content: this.response };
  }
}

describe("Planner", () => {
  it("parses a JSON task graph returned by the provider", async () => {
    const provider = new ScriptedProvider(
      JSON.stringify({
        tasks: [
          { id: "a", title: "Research", description: "research the topic", capability: "generic" },
          { id: "b", title: "Build", description: "build it", capability: "generic", dependsOn: ["a"] }
        ]
      })
    );
    const planner = new Planner(provider);
    const graph = await planner.plan("Build a thing");
    expect(graph.tasks).toHaveLength(2);
    expect(graph.tasks[1].dependsOn).toEqual(["a"]);
  });

  it("falls back to a single-task graph when the provider returns unparseable output", async () => {
    const provider = new ScriptedProvider("not json at all");
    const planner = new Planner(provider);
    const graph = await planner.plan("Do something");
    expect(graph.tasks).toHaveLength(1);
    expect(graph.tasks[0].description).toBe("Do something");
  });
});

describe("TaskExecutor", () => {
  it("executes a task graph end to end with the generic agent", async () => {
    const provider = new MockProvider();
    const agents = new AgentRegistry();
    agents.register(new GenericAgent());

    const executor = new TaskExecutor({
      agents,
      agentContext: { provider, tools: new ToolRegistry(), cwd: process.cwd() }
    });

    const results = await executor.execute({
      goal: "test",
      tasks: [
        { id: "a", title: "A", description: "do a", capability: "generic" },
        { id: "b", title: "B", description: "do b", capability: "generic", dependsOn: ["a"] }
      ]
    });

    expect(results.get("a")?.status).toBe("success");
    expect(results.get("b")?.status).toBe("success");
  });

  it("fails a task when no agent covers its capability", async () => {
    const provider = new MockProvider();
    const agents = new AgentRegistry();
    const executor = new TaskExecutor({ agents, agentContext: { provider, tools: new ToolRegistry(), cwd: process.cwd() }, retries: 0 });

    const results = await executor.execute({ goal: "g", tasks: [{ id: "a", title: "A", description: "x", capability: "unknown-cap" }] });
    expect(results.get("a")?.status).toBe("failed");
  });
});
