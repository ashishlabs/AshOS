import type { Mutation, MutationTargetKind } from "./types";

/** Catalog of every mutation available to the Researcher/Engine, discoverable like tools/agents/benchmarks. */
export class MutationRegistry {
  private mutations = new Map<string, Mutation>();

  register(mutation: Mutation): void {
    this.mutations.set(mutation.id, mutation);
  }

  get(id: string): Mutation | undefined {
    return this.mutations.get(id);
  }

  list(): Mutation[] {
    return [...this.mutations.values()];
  }

  byTargetKind(targetKind: MutationTargetKind): Mutation[] {
    return this.list().filter((m) => m.targetKind === targetKind);
  }
}
