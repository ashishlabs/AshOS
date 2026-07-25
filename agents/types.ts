import type { AIProvider } from "../providers/types";
import type { ToolRegistry } from "../tools/registry";
import type { MemoryManager } from "../memory/memory-manager";
import type { EventBus } from "../kernel/event-bus";

export interface AgentTask {
  id: string;
  description: string;
  input?: Record<string, unknown>;
}

export interface AgentContext {
  provider: AIProvider;
  tools: ToolRegistry;
  memory?: MemoryManager;
  eventBus?: EventBus;
  cwd: string;
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
