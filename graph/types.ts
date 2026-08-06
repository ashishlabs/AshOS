/**
 * Domain-agnostic node/edge vocabulary for `KnowledgeGraph`. Originally
 * scoped to Innovation Intelligence signals (problem/technology), this
 * type set was always broader than that one use — `project`/`agent`/
 * `workflow`/`skill`/`tool` existed here from the start but went
 * unpopulated until the General Knowledge Graph (North Star roadmap
 * Stage 4, see `docs/knowledge-graph.md`) started writing to a second,
 * project-scoped graph instance. `task` is new in that stage. `resource`
 * is new for Universal Inbox (`inbox/`, see `docs/inbox.md`) — a captured
 * piece of raw content (note, URL, repo link, ...) before it's been
 * triaged into something more specific like an `idea` or `paper`. `note`
 * is new for the Knowledge Vault (`vault/`, see `docs/knowledge-vault.md`)
 * — a curated, titled note, one step further triaged than a raw `resource`.
 * `todo` and `milestone` are new for Project Workspaces (`workspace/`, see
 * `docs/project-workspaces.md`) — a persisted `ProjectTask`/`Milestone`
 * record, distinct from the existing `task` kind, which `BaseAgent`
 * already uses for a one-off agent *execution* record identified by
 * `AgentTask.id`. Reusing `task` for both would risk merging an
 * ephemeral run record with an unrelated persisted to-do item that
 * happens to share a label — `upsertNode` dedupes by `(kind, label)`.
 */
export type KnowledgeNodeKind =
  | "person"
  | "company"
  | "repository"
  | "product"
  | "idea"
  | "problem"
  | "industry"
  | "technology"
  | "community"
  | "language"
  | "framework"
  | "market"
  | "startup"
  | "paper"
  | "workflow"
  | "agent"
  | "project"
  | "skill"
  | "tool"
  | "task"
  | "resource"
  | "note"
  | "todo"
  | "milestone";

export interface KnowledgeNode {
  id: string;
  kind: KnowledgeNodeKind;
  label: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  data?: Record<string, unknown>;
}

export type KnowledgeEdgeKind = "relates-to" | "produced-by" | "competes-with" | "part-of" | "mentions" | "solves";

export interface KnowledgeEdge {
  id: string;
  from: string;
  to: string;
  kind: KnowledgeEdgeKind;
  /** Strengthens every time the same edge is observed again. */
  weight: number;
  createdAt: string;
  updatedAt: string;
}
