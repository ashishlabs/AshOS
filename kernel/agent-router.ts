export interface Routable {
  name: string;
  capabilities: string[];
}

/**
 * Maps a requested capability (e.g. "code", "research", "git", "test") to
 * the best registered agent. Kept generic so it can route to agents,
 * plugin-contributed workers, or tools depending on capability tag.
 */
export class AgentRouter<T extends Routable = Routable> {
  private registry = new Map<string, T>();

  register(agent: T): void {
    this.registry.set(agent.name, agent);
  }

  unregister(name: string): void {
    this.registry.delete(name);
  }

  all(): T[] {
    return [...this.registry.values()];
  }

  get(name: string): T | undefined {
    return this.registry.get(name);
  }

  /** Finds the first registered agent advertising the given capability. */
  route(capability: string): T | undefined {
    return [...this.registry.values()].find((a) => a.capabilities.includes(capability));
  }

  /** Finds every agent advertising the given capability. */
  routeAll(capability: string): T[] {
    return [...this.registry.values()].filter((a) => a.capabilities.includes(capability));
  }
}
