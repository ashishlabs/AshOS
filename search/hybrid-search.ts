import type { MemoryManager } from "../memory/memory-manager";
import type { KnowledgeGraph } from "../graph/knowledge-graph";
import type { KnowledgeNode } from "../graph/types";
import type { InboxManager } from "../inbox/inbox-manager";
import type { InboxItem } from "../inbox/types";
import type { VaultManager } from "../vault/vault-manager";
import type { VaultNote } from "../vault/types";
import type { WorkspaceManager } from "../workspace/workspace-manager";
import type { Milestone, Project, ProjectTask } from "../workspace/types";
import type { SearchResult } from "./types";

export interface HybridSearchOptions {
  /** Max results returned, after merging and ranking across all five stores. */
  limit?: number;
  /** Use `MemoryManager.searchSemantic()` (embedding cosine similarity, best-effort) for the Memory slice instead of plain keyword matching. Graph/Inbox/Vault/Workspace matching is always keyword-based — none of the four computes embeddings. */
  semantic?: boolean;
}

function textScore(haystacks: string[], query: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  let best: number | null = null;
  for (const raw of haystacks) {
    const h = raw.toLowerCase();
    let score: number | null = null;
    if (h === q) score = 1;
    else if (h.startsWith(q)) score = 0.75;
    else if (h.includes(q)) score = 0.5;
    if (score !== null && (best === null || score > best)) best = score;
  }
  return best;
}

/**
 * "Find everything about X" across the five stores a Second Brain
 * capture/connect flow actually populates — Memory, the general
 * Knowledge Graph, the Inbox, the Knowledge Vault, and Project Workspaces
 * (`docs/second-brain-roadmap.md`). Deliberately not a sixth search
 * index: every slice queries its own store's existing lookup
 * (`MemoryManager.query`/`searchSemantic`, `KnowledgeGraph.listNodes`,
 * `InboxManager.list`, `VaultManager.list`, `WorkspaceManager.list*`) and
 * this class only merges and ranks the results. Graph/Inbox/Vault/
 * Workspace matching is a deterministic substring heuristic (same
 * "transparent heuristic over an LLM/embedding call wherever one is good
 * enough" convention as `codebase/indexer.ts`'s `searchIndex`); Memory
 * matching can opt into the existing semantic vector search instead.
 */
export class HybridSearch {
  constructor(
    private readonly memory: MemoryManager,
    private readonly graph: KnowledgeGraph,
    private readonly inbox: InboxManager,
    private readonly vault: VaultManager,
    private readonly workspace: WorkspaceManager
  ) {}

  async search(query: string, options: HybridSearchOptions = {}): Promise<SearchResult[]> {
    const limit = options.limit ?? 20;
    const memoryHits = options.semantic ? await this.searchMemorySemantic(query, limit) : this.searchMemory(query);
    const results = [
      ...memoryHits,
      ...this.searchGraph(query),
      ...this.searchInbox(query),
      ...this.searchVault(query),
      ...this.searchWorkspace(query)
    ];
    return results.sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  /** `InboxManager`/`VaultManager`/`WorkspaceManager` persist their records *as* Memory records (see `docs/inbox.md`/`docs/knowledge-vault.md`/`docs/project-workspaces.md`) — excluded here so a matching item surfaces once, via its own friendlier title/snippet, not twice. */
  private isSubsystemBackedRecord(tags: string[] | undefined): boolean {
    if (!tags) return false;
    return tags.includes("inbox") || tags.includes("vault") || tags.some((t) => t.startsWith("workspace-"));
  }

  private searchMemory(query: string): SearchResult[] {
    return this.memory
      .query({ text: query })
      .filter((record) => !this.isSubsystemBackedRecord(record.tags))
      .map((record) => ({
        source: "memory" as const,
        id: record.id,
        title: record.key,
        snippet: JSON.stringify(record.value).slice(0, 200),
        tags: record.tags ?? [],
        createdAt: record.createdAt,
        score: textScore([record.key, ...(record.tags ?? [])], query) ?? 0.4
      }));
  }

  private async searchMemorySemantic(query: string, limit: number): Promise<SearchResult[]> {
    const records = (await this.memory.searchSemantic(query, limit)).filter((record) => !this.isSubsystemBackedRecord(record.tags));
    return records.map((record, index) => ({
      source: "memory",
      id: record.id,
      title: record.key,
      snippet: JSON.stringify(record.value).slice(0, 200),
      tags: record.tags ?? [],
      createdAt: record.createdAt,
      // searchSemantic() returns results already ranked by cosine similarity but doesn't expose the raw score, so rank position is converted into a comparable 0-1 value instead of pretending to know the exact similarity.
      score: Math.max(0, 1 - index / Math.max(records.length, 1))
    }));
  }

  private searchGraph(query: string): SearchResult[] {
    const hits: SearchResult[] = [];
    for (const node of this.graph.listNodes()) {
      const score = textScore([node.label, ...node.tags], query);
      if (score !== null) hits.push(this.graphHit(node, score));
    }
    return hits;
  }

  private graphHit(node: KnowledgeNode, score: number): SearchResult {
    return {
      source: "graph",
      id: node.id,
      title: node.label,
      snippet: `[${node.kind}]${node.tags.length ? ` ${node.tags.join(", ")}` : ""}`,
      tags: node.tags,
      createdAt: node.createdAt,
      score
    };
  }

  private searchInbox(query: string): SearchResult[] {
    const hits: SearchResult[] = [];
    for (const item of this.inbox.list()) {
      const score = textScore([item.content, ...item.tags], query);
      if (score !== null) hits.push(this.inboxHit(item, score));
    }
    return hits;
  }

  private inboxHit(item: InboxItem, score: number): SearchResult {
    return {
      source: "inbox",
      id: item.id,
      title: item.content.length > 80 ? `${item.content.slice(0, 77)}...` : item.content,
      snippet: `[${item.sourceType}/${item.status}]`,
      tags: item.tags,
      createdAt: item.createdAt,
      score
    };
  }

  private searchVault(query: string): SearchResult[] {
    const hits: SearchResult[] = [];
    for (const note of this.vault.list()) {
      const score = textScore([note.title, note.content, ...note.tags], query);
      if (score !== null) hits.push(this.vaultHit(note, score));
    }
    return hits;
  }

  private vaultHit(note: VaultNote, score: number): SearchResult {
    return {
      source: "vault",
      id: note.id,
      title: note.title,
      snippet: `[${note.status}] ${note.content.length > 80 ? `${note.content.slice(0, 77)}...` : note.content}`,
      tags: note.tags,
      createdAt: note.createdAt,
      score
    };
  }

  private searchWorkspace(query: string): SearchResult[] {
    const hits: SearchResult[] = [];
    for (const project of this.workspace.listProjects()) {
      const score = textScore([project.name, project.description, ...project.tags], query);
      if (score !== null) hits.push(this.projectHit(project, score));

      for (const task of this.workspace.listTasks(project.id)) {
        const taskScore = textScore([task.title, task.description], query);
        if (taskScore !== null) hits.push(this.taskHit(task, project, taskScore));
      }
      for (const milestone of this.workspace.listMilestones(project.id)) {
        const milestoneScore = textScore([milestone.title], query);
        if (milestoneScore !== null) hits.push(this.milestoneHit(milestone, project, milestoneScore));
      }
    }
    return hits;
  }

  private projectHit(project: Project, score: number): SearchResult {
    return {
      source: "workspace",
      id: project.id,
      title: project.name,
      snippet: `[project/${project.status}] ${project.description}`.trim(),
      tags: project.tags,
      createdAt: project.createdAt,
      score
    };
  }

  private taskHit(task: ProjectTask, project: Project, score: number): SearchResult {
    return {
      source: "workspace",
      id: task.id,
      title: task.title,
      snippet: `[task/${task.status}] ${project.name}`,
      tags: [],
      createdAt: task.createdAt,
      score
    };
  }

  private milestoneHit(milestone: Milestone, project: Project, score: number): SearchResult {
    return {
      source: "workspace",
      id: milestone.id,
      title: milestone.title,
      snippet: `[milestone/${milestone.status}] ${project.name}`,
      tags: [],
      createdAt: milestone.createdAt,
      score
    };
  }
}
