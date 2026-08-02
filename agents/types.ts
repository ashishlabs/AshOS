import type { AIProvider } from "../providers/types";
import type { ModelRouter } from "../providers/router";
import type { ToolRegistry } from "../tools/registry";
import type { MemoryManager } from "../memory/memory-manager";
import type { EventBus } from "../kernel/event-bus";
import type { TaskComplexity } from "../kernel/config";

export interface AgentTask {
  id: string;
  description: string;
  input?: Record<string, unknown>;
  /** Optional hint for `ModelRouter` — overrides the agent's own capability-based default. Ignored when routing is disabled or `context.router` isn't provided. */
  complexity?: TaskComplexity;
}

export interface AgentContext {
  provider: AIProvider;
  tools: ToolRegistry;
  memory?: MemoryManager;
  eventBus?: EventBus;
  cwd: string;
  /** When present, `BaseAgent.execute()` resolves the effective provider per task via `router.select(task.complexity ?? <agent's default>)` instead of always using `provider` — see `docs/model-router.md`. */
  router?: ModelRouter;
}

export interface AgentResult {
  ok: boolean;
  output?: string;
  data?: unknown;
  error?: string;
}

/** Independent worker: given a task + shared context, produces a result. */
export interface Agent {
  name: string;
  description: string;
  capabilities: string[];
  execute(task: AgentTask, context: AgentContext): Promise<AgentResult>;
}
