import { randomUUID } from "node:crypto";
import type { AgentResult, AgentTask } from "./types";

/**
 * One agent task's outcome — the unit Stage 3 (Outcome Memory,
 * `docs/roadmap-v2.md`) persists so AshOS remembers "what was tried, what
 * happened" without being told to. Closes North Star goal #3's
 * failures/successful-solutions half; feeds goal #10 (Continuous
 * Learning) as the raw material a future pattern-extraction pass would
 * read.
 */
export interface TaskOutcome {
  agent: string;
  capability: string;
  taskId: string;
  description: string;
  outcome: "success" | "failure";
  output?: string;
  error?: string;
  durationMs: number;
  at: string;
}

/**
 * Unique per invocation — an agent can run the same task id more than
 * once (retries), and every attempt must be its own memory record, not an
 * overwrite. A timestamp alone isn't sufficient (two attempts can land in
 * the same millisecond), so a random suffix guarantees uniqueness; the
 * timestamp is kept in the key purely so records sort/scan chronologically
 * on disk.
 */
export function outcomeMemoryKey(agent: string, taskId: string, at: string): string {
  return `outcome:${agent}:${taskId}:${at}:${randomUUID().slice(0, 8)}`;
}

export function buildOutcome(params: {
  agent: string;
  capability: string;
  task: AgentTask;
  result: AgentResult;
  durationMs: number;
  at?: string;
}): TaskOutcome {
  return {
    agent: params.agent,
    capability: params.capability,
    taskId: params.task.id,
    description: params.task.description,
    outcome: params.result.ok ? "success" : "failure",
    output: params.result.output,
    error: params.result.error,
    durationMs: params.durationMs,
    at: params.at ?? new Date().toISOString()
  };
}
