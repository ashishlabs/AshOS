import { DagExecutor, type DagNode } from "../kernel/dag";
import type { EventBus } from "../kernel/event-bus";
import type { AgentRegistry } from "../agents/registry";
import type { AgentContext } from "../agents/types";
import type { TaskExecutionResult, TaskGraph } from "./types";

/** Capabilities whose output gets checked by a verification step before the task counts as done — see `docs/verification-gate.md`. Exported so callers can extend it as more code-producing agents are added. */
export const CODE_PRODUCING_CAPABILITIES = ["code"];

/** The capability `TaskExecutor` routes verification to — `TestingAgent` registers under this alongside `"test"`. */
export const VERIFICATION_CAPABILITY = "verify";

export interface TaskExecutorOptions {
  agents: AgentRegistry;
  agentContext: AgentContext;
  eventBus?: EventBus;
  maxParallel?: number;
  retries?: number;
  /** Set false to disable the verification gate entirely (e.g. in a test harness with no verify-capable agent registered). Defaults to true. */
  verify?: boolean;
}

/**
 * Executes a TaskGraph produced by the Planner: routes each task to the
 * agent advertising its capability, runs independent tasks in parallel via
 * the shared DagExecutor, retries on failure, and skips downstream tasks
 * whose dependencies failed.
 *
 * Also the Verification Gate (North Star roadmap Stage 5,
 * `docs/verification-gate.md`): a task routed to a code-producing
 * capability (`CODE_PRODUCING_CAPABILITIES`) that succeeds is not yet
 * "done" — a registered `verify`-capability agent (`TestingAgent` by
 * default) is run immediately after, inside the same DAG node, before the
 * node is allowed to report success. A verification failure throws,
 * which DagExecutor treats exactly like the original agent failing —
 * retried up to the node's configured `retries`, then reported as a
 * failed task with an error message that distinguishes "the code agent
 * failed" from "the code was produced but failed verification." This
 * closes North Star goal #1's "verify results," not just "execute and
 * report success."
 */
export class TaskExecutor {
  constructor(private opts: TaskExecutorOptions) {}

  async execute(graph: TaskGraph): Promise<Map<string, TaskExecutionResult>> {
    this.opts.eventBus?.emit("workflow:started", { goal: graph.goal });

    const nodes: DagNode[] = graph.tasks.map((task) => ({
      id: task.id,
      dependsOn: task.dependsOn,
      retries: this.opts.retries ?? 1,
      run: async () => {
        this.opts.eventBus?.emit("task:started", { id: task.id, title: task.title });
        const agent = this.opts.agents.findByCapability(task.capability);
        if (!agent) {
          throw new Error(`no agent registered for capability "${task.capability}"`);
        }
        const result = await agent.execute({ id: task.id, description: task.description }, this.opts.agentContext);
        if (!result.ok) throw new Error(result.error ?? `agent "${agent.name}" failed`);

        if ((this.opts.verify ?? true) && CODE_PRODUCING_CAPABILITIES.includes(task.capability)) {
          await this.verify(task.id, task.title);
        }

        return result.output ?? "";
      }
    }));

    const dag = new DagExecutor(nodes, {
      maxParallel: this.opts.maxParallel ?? 4,
      onEvent: (event) => {
        if (event.type === "node:success") this.opts.eventBus?.emit("task:finished", { id: event.id });
        if (event.type === "node:failed") this.opts.eventBus?.emit("task:failed", { id: event.id, error: event.error });
        if (event.type === "node:skipped") this.opts.eventBus?.emit("task:skipped", { id: event.id });
      }
    });

    const raw = await dag.run();
    const results = new Map<string, TaskExecutionResult>();
    for (const [id, r] of raw) {
      results.set(id, {
        id,
        status: r.status === "success" ? "success" : r.status === "failed" ? "failed" : "skipped",
        output: typeof r.result === "string" ? r.result : undefined,
        error: r.error instanceof Error ? r.error.message : (r.error as string | undefined),
        attempts: r.attempts
      });
    }

    this.opts.eventBus?.emit("workflow:finished", { goal: graph.goal });
    return results;
  }

  /**
   * Runs the registered `verify`-capability agent (`TestingAgent` by
   * default) after a code-producing task succeeds. Throws on verification
   * failure so the caller's DAG node treats it exactly like the original
   * agent failing (retried, then reported as a failed task). No-ops if no
   * verify-capable agent is registered, so environments without one behave
   * exactly as before this gate existed.
   */
  private async verify(taskId: string, title: string): Promise<void> {
    const verifier = this.opts.agents.findByCapability(VERIFICATION_CAPABILITY);
    if (!verifier) return;
    const verification = await verifier.execute(
      { id: `${taskId}-verify`, description: `Verify: ${title}` },
      this.opts.agentContext
    );
    this.opts.eventBus?.emit(verification.ok ? "task:verified" : "task:verification-failed", { id: taskId });
    if (!verification.ok) {
      throw new Error(`verification failed for "${title}": ${verification.error ?? "unknown reason"}`);
    }
  }
}
