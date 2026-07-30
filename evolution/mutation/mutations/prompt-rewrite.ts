import type { Mutation } from "../types";
import { applyFindReplace, revertSnapshots } from "../file-patch";

const DEFAULT_FILE = "agents/generic-agent.ts";
const DEFAULT_FIND = "You are a helpful, precise assistant embedded in AshOS.";
const DEFAULT_REPLACE = "You are a helpful, precise, and efficient assistant embedded in AshOS.";

/**
 * Replaces an agent's system prompt string with a researcher-proposed
 * rewrite. Falls back to a small, generic tweak when no `replace` param is
 * given — e.g. when the Researcher's own hypothesis generation failed and
 * the engine fell back to running this mutation with default params — so a
 * missing research response degrades to a low-risk no-op-ish experiment
 * instead of an error.
 */
export const promptRewriteMutation: Mutation = {
  id: "prompt-rewrite",
  name: "Prompt rewrite",
  description: "Replaces an agent's system prompt string with a researcher-proposed rewrite.",
  targetKind: "prompt",

  async apply(context, params = {}) {
    const filePath = (params.filePath as string) ?? DEFAULT_FILE;
    const find = (params.find as string) ?? DEFAULT_FIND;
    const replace = (params.replace as string | undefined) ?? DEFAULT_REPLACE;
    return applyFindReplace(context, "prompt-rewrite", filePath, find, replace);
  },

  async revert(context, applied) {
    revertSnapshots(context.workspaceRoot, applied.snapshots);
  }
};
