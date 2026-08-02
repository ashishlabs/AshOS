import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BaseAgent } from "../../agents/base-agent";
import type { AgentContext, AgentResult, AgentTask } from "../../agents/types";
import { buildModules, scanRepository, searchIndex } from "../indexer";
import { CodebaseIndexStore } from "../codebase-store";
import type { CodebaseIndex } from "../types";

const execFileAsync = promisify(execFile);

async function currentCommitHash(root: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Local Codebase Intelligence: indexes the actual working repository on
 * disk (file tree, per-file language, lightweight symbol extraction) so
 * "where does feature X live" is answered by reasoning from a cached
 * index instead of re-scanning/re-grepping every time. Distinct from
 * `innovation/agents/repository-analyst-agent.ts`, which analyzes
 * *external* GitHub repositories through their API — this one only ever
 * touches the local filesystem, no network at all.
 *
 * Caching mirrors `RepositoryAnalystAgent`'s "never repeat expensive
 * analysis unless something changed" rule: one cheap `git rev-parse HEAD`
 * call gates the full re-scan. Repositories that aren't a git working tree
 * (no commit hash available) are re-scanned every time — a known,
 * documented limitation rather than a silent correctness gap.
 */
export class CodebaseAnalystAgent extends BaseAgent {
  name = "codebase-analyst";
  description = "Indexes and searches the local working repository (file tree, modules, symbols) for Local Codebase Intelligence";
  capabilities = ["codebase-analyst", "codebase-intelligence"];

  constructor(private readonly store: CodebaseIndexStore = new CodebaseIndexStore(process.cwd())) {
    super();
  }

  async run(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const input = task.input ?? {};
    const root = (input.root as string | undefined) ?? context.cwd;
    const query = input.query as string | undefined;
    const force = Boolean(input.force);

    const commitHash = await currentCommitHash(root);
    const cached = this.store.get(root);
    const needsIndex = force || !cached || !commitHash || cached.commitHash !== commitHash;

    let index: CodebaseIndex;
    if (needsIndex) {
      const files = scanRepository(root);
      index = { root, commitHash, fileCount: files.length, files, modules: buildModules(files), indexedAt: new Date().toISOString() };
      this.store.save(index);
      context.eventBus?.emit("codebase:indexed", { root, fileCount: index.fileCount, commitHash });
    } else {
      index = cached;
    }

    this.enrichProjectNode(root, index, context);

    if (query) {
      const matches = searchIndex(index, query);
      const output = matches.length
        ? matches.map((m) => (m.symbol ? `${m.file}:${m.symbol.line} — ${m.symbol.kind} ${m.symbol.name}` : m.file)).join("\n")
        : `No matches for "${query}".`;
      return { ok: true, output, data: { query, matches, cached: !needsIndex } };
    }

    const summary = index.modules.map((m) => `${m.name} (${m.fileCount} files, ${m.symbolCount} symbols)`).join(", ");
    return {
      ok: true,
      output: `Indexed ${index.fileCount} file(s) across ${index.modules.length} module(s): ${summary}`,
      data: { index, cached: !needsIndex }
    };
  }

  /**
   * When `context.graph` is present, enriches the general Knowledge
   * Graph's `project` node (identity = the indexed `root`, not
   * necessarily `context.cwd` — indexing another repository gets its own
   * node) with real codebase structure: languages and module names. This
   * is on top of `BaseAgent`'s own generic per-attempt recording, which
   * only knows `context.cwd` — best-effort, never fails the actual index.
   */
  private enrichProjectNode(root: string, index: CodebaseIndex, context: AgentContext): void {
    if (!context.graph) return;
    try {
      const languages = [...new Set(index.files.map((f) => f.language).filter((l): l is string => Boolean(l)))];
      context.graph.upsertNode({
        kind: "project",
        label: root,
        tags: languages,
        data: { path: root, fileCount: index.fileCount, modules: index.modules.map((m) => m.name) }
      });
    } catch {
      // best-effort — never let graph enrichment fail the actual index
    }
  }
}
