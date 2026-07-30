export type { MutationTargetKind } from "../engine/types";
import type { MutationTargetKind } from "../engine/types";

export interface MutationContext {
  /** Absolute path to the isolated git worktree the mutation should modify — never the live working directory. */
  workspaceRoot: string;
}

export interface FileSnapshot {
  /** Path relative to workspaceRoot. */
  filePath: string;
  /** File content before the mutation, or null if the file did not exist. */
  originalContent: string | null;
}

export interface AppliedMutation {
  mutationId: string;
  params: Record<string, unknown>;
  filesChanged: string[];
  /** Enough state to fully undo the mutation via revertSnapshots(). */
  snapshots: FileSnapshot[];
  summary: string;
}

/**
 * A reversible, targeted change a research hypothesis can carry out inside
 * an isolated experiment workspace. Every mutation must be able to restore
 * exactly what it changed — see evolution/mutation/file-patch.ts for the
 * shared snapshot/revert helpers every built-in mutation uses.
 */
export interface Mutation {
  id: string;
  name: string;
  description: string;
  targetKind: MutationTargetKind;
  apply(context: MutationContext, params?: Record<string, unknown>): Promise<AppliedMutation>;
  revert(context: MutationContext, applied: AppliedMutation): Promise<void>;
}
