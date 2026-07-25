import type { Agent } from "./types";

/** Catalog of every agent available to the planner/router. */
export class AgentRegistry {
  private agents = new Map<string, Agent>();

  register(agent: Agent): void {
    this.agents.set(agent.name, agent);
  }

  get(name: string): Agent | undefined {
    return this.agents.get(name);
  }

  list(): Agent[] {
    return [...this.agents.values()];
  }

  findByCapability(capability: string): Agent | undefined {
    return this.list().find((a) => a.capabilities.includes(capability));
  }
}
