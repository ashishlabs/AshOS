import { defaultComplexityForCapability } from "../providers/router";
import { buildOutcome, outcomeMemoryKey } from "./outcome";
import type { Agent, AgentContext, AgentResult, AgentTask } from "./types";

/** Convenience base class handling the boilerplate of emitting lifecycle events. */
export abstract class BaseAgent implements Agent {
  abstract name: string;
  abstract description: string;
  abstract capabilities: string[];

  abstract run(task: AgentTask, context: AgentContext): Promise<AgentResult>;

  async execute(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    context.eventBus?.emit("agent:started", { agent: this.name, task: task.id });
    const startedAt = Date.now();
    try {
      const result = await this.run(task, this.resolveContext(task, context));
      context.eventBus?.emit(result.ok ? "agent:finished" : "agent:failed", { agent: this.name, task: task.id, result });
      await this.recordOutcome(task, context, result, Date.now() - startedAt);
      return result;
    } catch (error) {
      const result: AgentResult = { ok: false, error: (error as Error).message };
      context.eventBus?.emit("agent:failed", { agent: this.name, task: task.id, result });
      await this.recordOutcome(task, context, result, Date.now() - startedAt);
      return result;
    }
  }

  /**
   * When `context.memory` is present, persists a `TaskOutcome` record for
   * every attempt — "what was tried, what happened" — so AshOS remembers
   * failures and successful solutions without being told to (Stage 3,
   * `docs/roadmap-v2.md`). Unlike the router, this has no enable/disable
   * flag: writing a record never changes what an agent does or returns,
   * so there's no behavior to gate — only contexts that don't supply a
   * `MemoryManager` at all (e.g. `InnovationModule`'s own high-frequency
   * discovery agents, which already have their own persistence) opt out,
   * by simply not passing `memory`. Best-effort: a memory-write failure
   * never surfaces as a failure of the task itself.
   */
  private async recordOutcome(task: AgentTask, context: AgentContext, result: AgentResult, durationMs: number): Promise<void> {
    if (!context.memory) return;
    const outcome = buildOutcome({ agent: this.name, capability: this.capabilities[0] ?? "unknown", task, result, durationMs });
    try {
      await context.memory.remember("project", outcomeMemoryKey(this.name, task.id, outcome.at), outcome, {
        tags: ["outcome", this.name, outcome.outcome]
      });
    } catch {
      // best-effort — never let outcome logging fail the task it's describing
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
