export interface DagNode<T = unknown> {
  id: string;
  dependsOn?: string[];
  run: (ctx: DagRunContext) => Promise<T>;
  retries?: number;
  retryDelayMs?: number;
  rollback?: (ctx: DagRunContext, error: unknown) => Promise<void> | void;
}

export interface DagRunContext {
  results: Map<string, unknown>;
}

export type DagNodeStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface DagRunResult {
  id: string;
  status: DagNodeStatus;
  result?: unknown;
  error?: unknown;
  attempts: number;
}

export interface DagExecutorOptions {
  maxParallel?: number;
  onEvent?: (event: { type: "node:start" | "node:success" | "node:failed" | "node:skipped" | "node:retry"; id: string; attempt?: number; error?: unknown }) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generic dependency-graph executor: runs independent nodes in parallel
 * (bounded by maxParallel), respects `dependsOn`, retries failed nodes with
 * backoff, and cascades skips to downstream nodes when a dependency fails
 * permanently. Shared by the Planner (LLM-generated task graphs) and the
 * Workflow engine (user-authored workflow definitions).
 */
export class DagExecutor<T = unknown> {
  private nodes: Map<string, DagNode<T>>;
  private maxParallel: number;
  private onEvent?: DagExecutorOptions["onEvent"];

  constructor(nodes: DagNode<T>[], opts: DagExecutorOptions = {}) {
    this.nodes = new Map(nodes.map((n) => [n.id, n]));
    this.maxParallel = opts.maxParallel ?? 4;
    this.onEvent = opts.onEvent;
    this.validate();
  }

  private validate(): void {
    for (const node of this.nodes.values()) {
      for (const dep of node.dependsOn ?? []) {
        if (!this.nodes.has(dep)) {
          throw new Error(`DagExecutor: node "${node.id}" depends on unknown node "${dep}"`);
        }
      }
    }
  }

  async run(): Promise<Map<string, DagRunResult>> {
    const results = new Map<string, DagRunResult>();
    const ctx: DagRunContext = { results: new Map() };
    const pending = new Set(this.nodes.keys());
    const inFlight = new Set<string>();

    const isReady = (id: string): boolean => {
      const node = this.nodes.get(id)!;
      return (node.dependsOn ?? []).every((dep) => {
        const r = results.get(dep);
        return r && r.status === "success";
      });
    };

    const isBlocked = (id: string): boolean => {
      const node = this.nodes.get(id)!;
      return (node.dependsOn ?? []).some((dep) => {
        const r = results.get(dep);
        return r && (r.status === "failed" || r.status === "skipped");
      });
    };

    const runNode = async (id: string): Promise<void> => {
      const node = this.nodes.get(id)!;
      const maxAttempts = (node.retries ?? 0) + 1;
      let attempt = 0;
      let lastError: unknown;

      this.onEvent?.({ type: "node:start", id });
      while (attempt < maxAttempts) {
        attempt++;
        try {
          const result = await node.run(ctx);
          ctx.results.set(id, result);
          results.set(id, { id, status: "success", result, attempts: attempt });
          this.onEvent?.({ type: "node:success", id, attempt });
          return;
        } catch (error) {
          lastError = error;
          if (attempt < maxAttempts) {
            this.onEvent?.({ type: "node:retry", id, attempt, error });
            await sleep(node.retryDelayMs ?? 250 * attempt);
          }
        }
      }
      if (node.rollback) {
        await node.rollback(ctx, lastError);
      }
      results.set(id, { id, status: "failed", error: lastError, attempts: attempt });
      this.onEvent?.({ type: "node:failed", id, error: lastError });
    };

    while (pending.size > 0 || inFlight.size > 0) {
      for (const id of [...pending]) {
        if (isBlocked(id)) {
          results.set(id, { id, status: "skipped", attempts: 0 });
          this.onEvent?.({ type: "node:skipped", id });
          pending.delete(id);
          continue;
        }
      }

      const ready = [...pending].filter(isReady);
      const slots = this.maxParallel - inFlight.size;
      const toStart = ready.slice(0, Math.max(0, slots));

      if (toStart.length === 0 && inFlight.size === 0 && pending.size > 0) {
        // Nothing ready, nothing in flight, but nodes remain: unresolved cycle or stuck state.
        for (const id of pending) {
          results.set(id, { id, status: "skipped", attempts: 0 });
          this.onEvent?.({ type: "node:skipped", id });
        }
        pending.clear();
        break;
      }

      for (const id of toStart) {
        pending.delete(id);
        inFlight.add(id);
        void runNode(id).finally(() => inFlight.delete(id));
      }

      // Wait a tick for at least one in-flight node to progress before re-checking.
      await sleep(10);
    }

    return results;
  }
}
