import type { MemoryManager } from "../memory/memory-manager";
import type { KnowledgeGraph } from "../graph/knowledge-graph";
import type { KnowledgeNode } from "../graph/types";
import type { InboxManager } from "../inbox/inbox-manager";
import type { InboxItem } from "../inbox/types";
import type { VaultManager } from "../vault/vault-manager";
import type { VaultNote } from "../vault/types";
import type { WorkspaceManager } from "../workspace/workspace-manager";
import type { Milestone, Project, ProjectTask } from "../workspace/types";
import type { LearningManager } from "../learning/learning-manager";
import type { Flashcard, LearningResource } from "../learning/types";
import type { SearchResult } from "./types";

export interface HybridSearchOptions {
  /** Max results returned, after merging and ranking across all six stores. */
  limit?: number;
  /**
   * Use embedding cosine similarity instead of plain keyword matching.
   * Memory, Inbox, Vault, Workspace, and Learning all persist through
   * `MemoryManager.remember()` (Inbox/Vault/Workspace/Learning records are
   * themselves Memory records, see `isSubsystemBackedRecord`), so they all
   * already get a best-effort embedding computed and indexed today — this
   * mode is one `MemoryManager.searchSemantic()` call, partitioned back out
   * by tag into each source's own friendlier hit shape. Graph is the one
   * exception: `KnowledgeGraph` nodes have no embedding storage, so Graph
   * results stay keyword-based even in semantic mode (see `docs/search.md`).
   */
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
 * "Find everything about X" across the six stores a Second Brain
 * capture/connect flow actually populates — Memory, the general
 * Knowledge Graph, the Inbox, the Knowledge Vault, Project Workspaces,
 * and the Learning Hub (`docs/second-brain-roadmap.md`). Deliberately
 * not a seventh search index: every slice queries its own store's
 * existing lookup (`MemoryManager.query`/`searchSemantic`,
 * `KnowledgeGraph.listNodes`, `InboxManager.list`, `VaultManager.list`,
 * `WorkspaceManager.list*`, `LearningManager.list*`) and this class only
 * merges and ranks the results. In keyword mode (the default), every
 * source is a deterministic substring heuristic (same "transparent
 * heuristic over an LLM/embedding call wherever one is good enough"
 * convention as `codebase/indexer.ts`'s `searchIndex`). In semantic mode
 * (`{ semantic: true }`), Memory/Inbox/Vault/Workspace/Learning all opt
 * into `MemoryManager.searchSemantic()`'s embedding cosine similarity —
 * Inbox/Vault/Workspace/Learning records are themselves Memory records
 * (see `isSubsystemBackedRecord`), so they already carry a best-effort
 * embedding with no new indexing needed. Graph is the one source with no
 * embedding storage today, so it stays keyword-based in both modes.
 */
export class HybridSearch {
  constructor(
    private readonly memory: MemoryManager,
    private readonly graph: KnowledgeGraph,
    private readonly inbox: InboxManager,
    private readonly vault: VaultManager,
    private readonly workspace: WorkspaceManager,
    private readonly learning: LearningManager
  ) {}

  async search(query: string, options: HybridSearchOptions = {}): Promise<SearchResult[]> {
    const limit = options.limit ?? 20;
    const results = options.semantic
      ? [...(await this.searchSubsystemsSemantic(query, limit)), ...this.searchGraph(query)]
      : [
          ...this.searchMemory(query),
          ...this.searchGraph(query),
          ...this.searchInbox(query),
          ...this.searchVault(query),
          ...this.searchWorkspace(query),
          ...this.searchLearning(query)
        ];
    return results.sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  /** `InboxManager`/`VaultManager`/`WorkspaceManager`/`LearningManager` persist their records *as* Memory records (see `docs/inbox.md`/`docs/knowledge-vault.md`/`docs/project-workspaces.md`/`docs/learning-hub.md`) — excluded here so a matching item surfaces once, via its own friendlier title/snippet, not twice. */
  private isSubsystemBackedRecord(tags: string[] | undefined): boolean {
    if (!tags) return false;
    return tags.includes("inbox") || tags.includes("vault") || tags.some((t) => t.startsWith("workspace-") || t.startsWith("learning-"));
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

  /**
   * One `MemoryManager.searchSemantic()` call covers Memory, Inbox, Vault,
   * Workspace, and Learning at once, since the latter four persist through
   * `remember()` too — each hit is routed back to its own source's hit
   * shape by the same subsystem tag `isSubsystemBackedRecord` checks,
   * rather than by re-querying each manager. Over-fetches (`limit * 4`)
   * because one flat cross-source ranking now has to leave enough room for
   * all five sources' worth of candidates, not just Memory's.
   */
  private async searchSubsystemsSemantic(query: string, limit: number): Promise<SearchResult[]> {
    const records = await this.memory.searchSemantic(query, Math.max(limit * 4, 40));
    // searchSemantic() returns results already ranked by cosine similarity but doesn't expose the raw score, so rank position is converted into a comparable 0-1 value instead of pretending to know the exact similarity.
    const scoreAt = (index: number) => Math.max(0, 1 - index / Math.max(records.length, 1));

    const hits: SearchResult[] = [];
    records.forEach((record, index) => {
      const score = scoreAt(index);
      const tags = record.tags ?? [];
      if (tags.includes("inbox")) {
        hits.push(this.inboxHit(record.value as InboxItem, score));
      } else if (tags.includes("vault")) {
        hits.push(this.vaultHit(record.value as VaultNote, score));
      } else if (tags.includes("workspace-project")) {
        hits.push(this.projectHit(record.value as Project, score));
      } else if (tags.includes("workspace-task")) {
        const task = record.value as ProjectTask;
        const project = this.workspace.getProject(task.projectId);
        if (project) hits.push(this.taskHit(task, project, score));
      } else if (tags.includes("workspace-milestone")) {
        const milestone = record.value as Milestone;
        const project = this.workspace.getProject(milestone.projectId);
        if (project) hits.push(this.milestoneHit(milestone, project, score));
      } else if (tags.includes("learning-resource")) {
        hits.push(this.resourceHit(record.value as LearningResource, score));
      } else if (tags.includes("learning-flashcard")) {
        hits.push(this.cardHit(record.value as Flashcard, score));
      } else {
        hits.push({
          source: "memory",
          id: record.id,
          title: record.key,
          snippet: JSON.stringify(record.value).slice(0, 200),
          tags,
          createdAt: record.createdAt,
          score
        });
      }
    });
    return hits;
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

  private searchLearning(query: string): SearchResult[] {
    const hits: SearchResult[] = [];
    for (const resource of this.learning.listResources()) {
      const score = textScore([resource.title, resource.notes, ...resource.tags], query);
      if (score !== null) hits.push(this.resourceHit(resource, score));
    }
    for (const card of this.learning.listCards()) {
      const score = textScore([card.front, card.back, ...card.tags], query);
      if (score !== null) hits.push(this.cardHit(card, score));
    }
    return hits;
  }

  private resourceHit(resource: LearningResource, score: number): SearchResult {
    return {
      source: "learning",
      id: resource.id,
      title: resource.title,
      snippet: `[${resource.type}/${resource.status}] ${resource.notes}`.trim(),
      tags: resource.tags,
      createdAt: resource.createdAt,
      score
    };
  }

  private cardHit(card: Flashcard, score: number): SearchResult {
    return {
      source: "learning",
      id: card.id,
      title: card.front,
      snippet: `[flashcard] ${card.back}`,
      tags: card.tags,
      createdAt: card.createdAt,
      score
    };
  }
}
