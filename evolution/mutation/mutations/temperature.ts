import type { Mutation } from "../types";
import { applyFindReplace, revertSnapshots } from "../file-patch";

const DEFAULT_FILE = "agents/generic-agent.ts";
const ANCHOR = '{ role: "user", content: task.description }\n    ]);';

/** Adds (or changes) an explicit sampling temperature on an agent's chat() call. */
export const temperatureMutation: Mutation = {
  id: "temperature-adjust",
  name: "Temperature adjustment",
  description: "Adds an explicit sampling temperature to an agent's provider.chat() call.",
  targetKind: "temperature",

  async apply(context, params = {}) {
    const filePath = (params.filePath as string) ?? DEFAULT_FILE;
    const temperature = typeof params.temperature === "number" ? params.temperature : 0.3;
    const replace = ANCHOR.replace("]);", `], { temperature: ${temperature} });`);
    return applyFindReplace(context, "temperature-adjust", filePath, ANCHOR, replace);
  },

  async revert(context, applied) {
    revertSnapshots(context.workspaceRoot, applied.snapshots);
  }
};
