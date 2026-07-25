import { DagExecutor, type DagNode } from "../kernel/dag";
import type { EventBus } from "../kernel/event-bus";
import type { AgentRegistry } from "../agents/registry";
import type { AgentContext } from "../agents/types";
import type { TaskExecutionResult, TaskGraph } from "./types";

export interface TaskExecutorOptions {
  agents: AgentRegistry;
  agentContext: AgentContext;
  eventBus?: EventBus;
  maxParallel?: number;
  retries?: number;
}

/**
 * Executes a TaskGraph produced by the Planner: routes each task to the
 * agent advertising its capability, runs independent tasks in parallel via
 * the shared DagExecutor, retries on failure, and skips downstream tasks
 * whose dependencies failed.
 */
export class TaskExecutor {
  constructor(private opts: TaskExecutorOptions) {}

  async execute(graph: TaskGraph): Promise<Map<string, TaskExecutionResult>> {
    this.opts.eventBus?.emit("workflow:started", { goal: graph.goal });

    const nodes: DagNode[] = graph.tasks.map((task) => ({
      id: task.id,
      dependsOn: task.dependsOn,
      retries: this.opts.retries ?? 1,
      run: async () => {
        this.opts.eventBus?.emit("task:started", { id: task.id, title: task.title });
        const agent = this.opts.agents.findByCapability(task.capability);
        if (!agent) {
          throw new Error(`no agent registered for capability "${task.capability}"`);
        }
        const result = await agent.execute({ id: task.id, description: task.description }, this.opts.agentContext);
        if (!result.ok) throw new Error(result.error ?? `agent "${agent.name}" failed`);
        return result.output ?? "";
      }
    }));

    const dag = new DagExecutor(nodes, {
      maxParallel: this.opts.maxParallel ?? 4,
      onEvent: (event) => {
        if (event.type === "node:success") this.opts.eventBus?.emit("task:finished", { id: event.id });
        if (event.type === "node:failed") this.opts.eventBus?.emit("task:failed", { id: event.id, error: event.error });
        if (event.type === "node:skipped") this.opts.eventBus?.emit("task:skipped", { id: event.id });
      }
    });

    const raw = await dag.run();
    const results = new Map<string, TaskExecutionResult>();
    for (const [id, r] of raw) {
      results.set(id, {
        id,
        status: r.status === "success" ? "success" : r.status === "failed" ? "failed" : "skipped",
        output: typeof r.result === "string" ? r.result : undefined,
        error: r.error instanceof Error ? r.error.message : (r.error as string | undefined),
        attempts: r.attempts
      });
    }

    this.opts.eventBus?.emit("workflow:finished", { goal: graph.goal });
    return results;
  }
}
