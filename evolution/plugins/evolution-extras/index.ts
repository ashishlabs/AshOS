import type { Plugin } from "../../../kernel/types";
import type { AppliedMutation, Mutation, MutationContext } from "../../mutation/types";
import type { Benchmark } from "../../benchmark/types";
import { revertSnapshots, snapshotFile, writeFile } from "../../mutation/file-patch";
import manifest from "./manifest.json";

const DEFAULT_FILE = "agents/generic-agent.ts";

/**
 * "Context compression" mutation: strips single-line `//` comments from a
 * source file. Behavior-neutral (comments aren't executed) but reduces
 * token count — a legitimate, if modest, efficiency lever a plugin can
 * contribute without touching the Evolution Engine itself.
 */
const commentStripMutation: Mutation = {
  id: "comment-strip",
  name: "Comment stripping",
  description: "Removes single-line comments from a source file to reduce token usage without changing behavior.",
  targetKind: "context-size",

  async apply(context: MutationContext, params: Record<string, unknown> = {}): Promise<AppliedMutation> {
    const filePath = (params.filePath as string) ?? DEFAULT_FILE;
    const snapshot = snapshotFile(context.workspaceRoot, filePath);
    if (snapshot.originalContent === null) {
      throw new Error(`comment-strip mutation: file "${filePath}" does not exist in workspace`);
    }

    const stripped = snapshot.originalContent
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    writeFile(context.workspaceRoot, filePath, stripped);

    return {
      mutationId: "comment-strip",
      params: { filePath },
      filesChanged: [filePath],
      snapshots: [snapshot],
      summary: `Stripped comment-only lines from ${filePath}`
    };
  },

  async revert(context: MutationContext, applied: AppliedMutation): Promise<void> {
    revertSnapshots(context.workspaceRoot, applied.snapshots);
  }
};

/** Documentation-category benchmark: a plain-English summary, scored by concept coverage. */
const documentationSummaryBenchmark: Benchmark = {
  id: "documentation-summary",
  category: "documentation",
  description: "Summarize what a dependency-graph task executor does, in one paragraph, for a new contributor",
  input:
    "In one short paragraph, explain what a dependency-graph task executor — one that runs independent tasks in parallel, retries failures, and skips downstream tasks when a dependency fails — is for, as if explaining it to a new contributor.",
  timeoutMs: 30_000,
  metadata: { difficulty: "easy" },
  score(actualOutput: string): number {
    const concepts = ["parallel", "depend", "retry", "fail", "task"];
    const lower = actualOutput.toLowerCase();
    const hits = concepts.filter((concept) => lower.includes(concept)).length;
    return hits / concepts.length;
  }
};

export const plugin: Plugin = {
  manifest,
  register(host) {
    host.evolution.mutations.register(commentStripMutation);
    host.evolution.benchmarks.register(documentationSummaryBenchmark);
  }
};

export default plugin;
