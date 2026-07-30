import type { Mutation } from "../types";
import { snapshotFile, writeFile, revertSnapshots } from "../file-patch";

const DEFAULT_FILE = "examples/workflows/research-and-build.json";

interface WorkflowStep {
  id: string;
  dependsOn?: string[];
  [key: string]: unknown;
}

interface WorkflowDefinition {
  name: string;
  steps: WorkflowStep[];
  [key: string]: unknown;
}

/**
 * Reorders steps in a workflow JSON definition. The DagExecutor schedules
 * purely by `dependsOn`, not array position, so reordering the array can't
 * change correctness — but it can change which independent steps a
 * bounded-concurrency run picks up first, which is a real, measurable
 * "workflow ordering" lever.
 */
export const workflowReorderMutation: Mutation = {
  id: "workflow-reorder",
  name: "Workflow step reorder",
  description: "Reverses step order in a workflow JSON definition (dependency correctness is unaffected).",
  targetKind: "workflow",

  async apply(context, params = {}) {
    const filePath = (params.filePath as string) ?? DEFAULT_FILE;
    const snapshot = snapshotFile(context.workspaceRoot, filePath);
    if (snapshot.originalContent === null) {
      throw new Error(`workflow-reorder mutation: file "${filePath}" does not exist in workspace`);
    }

    const definition = JSON.parse(snapshot.originalContent) as WorkflowDefinition;
    definition.steps = [...definition.steps].reverse();
    writeFile(context.workspaceRoot, filePath, JSON.stringify(definition, null, 2));

    return {
      mutationId: "workflow-reorder",
      params: { filePath },
      filesChanged: [filePath],
      snapshots: [snapshot],
      summary: `Reversed step order in ${filePath}`
    };
  },

  async revert(context, applied) {
    revertSnapshots(context.workspaceRoot, applied.snapshots);
  }
};
