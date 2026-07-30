import type { Mutation } from "../types";
import { applyFindReplace, revertSnapshots } from "../file-patch";

const DEFAULT_FILE = "planner/executor.ts";
const ANCHOR = "retries: this.opts.retries ?? 1,";

/** Changes the default per-task retry count in the Planner's TaskExecutor. */
export const retryCountMutation: Mutation = {
  id: "retry-count-adjust",
  name: "Retry count adjustment",
  description: "Changes the default per-task retry count in planner/executor.ts.",
  targetKind: "retry-logic",

  async apply(context, params = {}) {
    const filePath = (params.filePath as string) ?? DEFAULT_FILE;
    const retries = typeof params.retries === "number" ? params.retries : 2;
    const replace = `retries: this.opts.retries ?? ${retries},`;
    return applyFindReplace(context, "retry-count-adjust", filePath, ANCHOR, replace);
  },

  async revert(context, applied) {
    revertSnapshots(context.workspaceRoot, applied.snapshots);
  }
};
