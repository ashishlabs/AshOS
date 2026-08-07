import { BaseAgent } from "./base-agent";
import type { AgentContext, AgentResult, AgentTask } from "./types";
import { MemoryManager } from "../memory/memory-manager";
import { KnowledgeGraph } from "../graph/knowledge-graph";
import { InboxManager } from "../inbox/inbox-manager";
import { VaultManager } from "../vault/vault-manager";
import { WorkspaceManager } from "../workspace/workspace-manager";
import { LearningManager } from "../learning/learning-manager";
import { HybridSearch } from "../search/hybrid-search";
import type { SearchResult } from "../search/types";

const SYSTEM_PROMPT =
  "You are AshOS's knowledge base assistant. Answer the user's question using ONLY the numbered excerpts below, drawn from what they've already captured in Inbox, Vault, Projects, Learning, and the Knowledge Graph. Cite the excerpt number(s) you drew on inline, like [1] or [2][3]. If the excerpts don't actually answer the question, say so plainly instead of guessing or using outside knowledge.";

/** One citation `AskAgent.run()` grounded its answer in — enough for a caller to look the source record up (`source` + `id`) or just show the title. */
export interface Citation {
  n: number;
  source: SearchResult["source"];
  id: string;
  title: string;
}

/**
 * Answers a question from what's already in the knowledge base, citing
 * its sources — the synthesis layer `HybridSearch` itself deliberately
 * doesn't have (`search/hybrid-search.ts` returns ranked raw hits, not a
 * written answer). Constructs its own collaborators fresh from
 * `context.cwd`, the same convention `ReflectionAgent` already uses,
 * since `AgentContext` has no shared `HybridSearch` instance to inject.
 * Defaults to semantic search (unlike `ash search`'s own keyword-first
 * default) since a natural-language question rarely shares literal words
 * with the record that answers it — a deliberate, narrower choice than
 * changing `HybridSearch`'s own default.
 */
export class AskAgent extends BaseAgent {
  name = "ask";
  description = "Answers a question from captured Inbox/Vault/Workspace/Learning/Graph records, citing what it drew on";
  capabilities = ["ask", "qa"];

  async run(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const question = ((task.input?.question as string | undefined) ?? task.description)?.trim();
    if (!question) return { ok: false, error: "no question given" };

    // Passing `context.provider` here is what makes searchSemantic() do real
    // embedding search instead of silently falling back to a keyword query —
    // MemoryManager's own `opts.provider` is independent of AgentContext's.
    const memory = new MemoryManager(context.cwd, { provider: context.provider });
    const graph = new KnowledgeGraph(context.cwd);
    const inbox = new InboxManager(memory);
    const vault = new VaultManager(memory);
    const workspace = new WorkspaceManager(memory);
    const learning = new LearningManager(memory);
    const search = new HybridSearch(memory, graph, inbox, vault, workspace, learning);

    const limit = Number(task.input?.limit ?? 8);
    const semantic = Boolean(task.input?.semantic ?? true);
    const results = await search.search(question, { limit, semantic });

    if (results.length === 0) {
      return { ok: true, output: "Nothing captured about that yet.", data: { question, citations: [] } };
    }

    const excerpts = results.map((r, i) => `[${i + 1}] (${r.source}) ${r.title}\n${r.snippet}`).join("\n\n");
    const { content } = await context.provider.chat([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Question: ${question}\n\nExcerpts:\n${excerpts}` }
    ]);

    const citations: Citation[] = results.map((r, i) => ({ n: i + 1, source: r.source, id: r.id, title: r.title }));
    return { ok: true, output: content, data: { question, citations } };
  }
}
