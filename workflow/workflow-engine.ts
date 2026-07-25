import fs from "node:fs";
import { DagExecutor, type DagNode } from "../kernel/dag";
import type { EventBus } from "../kernel/event-bus";
import type { AgentRegistry } from "../agents/registry";
import type { AgentContext } from "../agents/types";
import type { ToolRegistry } from "../tools/registry";
import type { WorkflowDefinition, WorkflowStepResult } from "./types";

export interface WorkflowEngineOptions {
  agents: AgentRegistry;
  tools: ToolRegistry;
  agentContext: AgentContext;
  eventBus?: EventBus;
  maxParallel?: number;
}

/**
 * Executes user-authored workflow definitions (JSON): a chain/graph of
 * steps, each either an agent invocation ("agent:<capability>") or a direct
 * tool call ("tool:<name>"). This is the engine behind the visual workflow
 * builder described in the architecture doc — the builder emits this JSON.
 */
export class WorkflowEngine {
  constructor(private opts: WorkflowEngineOptions) {}

  static loadDefinition(filePath: string): WorkflowDefinition {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }

  async run(definition: WorkflowDefinition): Promise<Map<string, WorkflowStepResult>> {
    this.opts.eventBus?.emit("workflow:started", { name: definition.name });

    const nodes: DagNode[] = definition.steps.map((step) => ({
      id: step.id,
      dependsOn: step.dependsOn,
      run: async () => {
        const [kind, ref] = step.uses.split(":");
        if (kind === "tool") {
          const tool = this.opts.tools.get(ref);
          if (!tool) throw new Error(`workflow step "${step.id}": unknown tool "${ref}"`);
          const result = await tool.execute({ action: step.action ?? "run", args: step.params });
          if (!result.ok) throw new Error(result.error ?? `tool "${ref}" failed`);
          return result.output;
        }
        if (kind === "agent") {
          const agent = this.opts.agents.findByCapability(ref);
          if (!agent) throw new Error(`workflow step "${step.id}": no agent for capability "${ref}"`);
          const result = await agent.execute(
            { id: step.id, description: String(step.params?.description ?? ""), input: step.params },
            this.opts.agentContext
          );
          if (!result.ok) throw new Error(result.error ?? `agent "${agent.name}" failed`);
          return result.output;
        }
        throw new Error(`workflow step "${step.id}": "uses" must start with "agent:" or "tool:"`);
      }
    }));

    const dag = new DagExecutor(nodes, { maxParallel: this.opts.maxParallel ?? 4 });
    const raw = await dag.run();

    const results = new Map<string, WorkflowStepResult>();
    for (const [id, r] of raw) {
      results.set(id, {
        id,
        status: r.status === "success" ? "success" : r.status === "failed" ? "failed" : "skipped",
        output: r.result,
        error: r.error instanceof Error ? r.error.message : (r.error as string | undefined)
      });
    }

    this.opts.eventBus?.emit("workflow:finished", { name: definition.name });
    return results;
  }
}
