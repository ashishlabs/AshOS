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
      const result = await this.run(task, context);
      context.eventBus?.emit(result.ok ? "agent:finished" : "agent:failed", { agent: this.name, task: task.id, result });
      return result;
    } catch (error) {
      const result: AgentResult = { ok: false, error: (error as Error).message };
      context.eventBus?.emit("agent:failed", { agent: this.name, task: task.id, result });
      return result;
    }
  }
}
