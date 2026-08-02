import { defaultComplexityForCapability } from "../providers/router";
import type { Agent, AgentContext, AgentResult, AgentTask } from "./types";

/** Convenience base class handling the boilerplate of emitting lifecycle events. */
export abstract class BaseAgent implements Agent {
  abstract name: string;
  abstract description: string;
  abstract capabilities: string[];

  abstract run(task: AgentTask, context: AgentContext): Promise<AgentResult>;

  async execute(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    context.eventBus?.emit("agent:started", { agent: this.name, task: task.id });
    try {
      const result = await this.run(task, this.resolveContext(task, context));
      context.eventBus?.emit(result.ok ? "agent:finished" : "agent:failed", { agent: this.name, task: task.id, result });
      return result;
    } catch (error) {
      const result: AgentResult = { ok: false, error: (error as Error).message };
      context.eventBus?.emit("agent:failed", { agent: this.name, task: task.id, result });
      return result;
    }
  }

  /**
   * When a `ModelRouter` is present on the context, swaps `provider` for
   * the router's pick for this task before handing off to `run()` — every
   * existing agent gets routing for free without touching its own
   * `run()` implementation. Absent a router (the default), returns
   * `context` unchanged.
   */
  private resolveContext(task: AgentTask, context: AgentContext): AgentContext {
    if (!context.router) return context;
    const complexity = task.complexity ?? defaultComplexityForCapability(this.capabilities[0]);
    return { ...context, provider: context.router.select(complexity) };
  }
}
