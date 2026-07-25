export interface PlannedTask {
  id: string;
  title: string;
  description: string;
  /** capability tag routed to an agent, e.g. "research", "code", "test", "git" */
  capability: string;
  dependsOn?: string[];
}

export interface TaskGraph {
  goal: string;
  tasks: PlannedTask[];
}

export interface TaskExecutionResult {
  id: string;
  status: "success" | "failed" | "skipped";
  output?: string;
  error?: string;
  attempts: number;
}
