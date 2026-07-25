import type { Tool } from "./types";

/** Central catalog of every tool available to agents, the planner, and workflows. */
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.capabilities().name, tool);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  async healthCheckAll(): Promise<Record<string, { healthy: boolean; detail?: string }>> {
    const entries = await Promise.all(
      [...this.tools.entries()].map(async ([name, tool]) => [name, await tool.healthCheck()] as const)
    );
    return Object.fromEntries(entries);
  }
}
