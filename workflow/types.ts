export interface WorkflowStep {
  id: string;
  /** "agent:<capability>" or "tool:<toolName>" */
  uses: string;
  action?: string;
  params?: Record<string, unknown>;
  dependsOn?: string[];
}

export interface WorkflowDefinition {
  name: string;
  description?: string;
  steps: WorkflowStep[];
}

export interface WorkflowStepResult {
  id: string;
  status: "success" | "failed" | "skipped";
  output?: unknown;
  error?: string;
}
