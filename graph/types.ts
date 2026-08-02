/**
 * Domain-agnostic node/edge vocabulary for `KnowledgeGraph`. Originally
 * scoped to Innovation Intelligence signals (problem/technology), this
 * type set was always broader than that one use — `project`/`agent`/
 * `workflow`/`skill`/`tool` existed here from the start but went
 * unpopulated until the General Knowledge Graph (North Star roadmap
 * Stage 4, see `docs/knowledge-graph.md`) started writing to a second,
 * project-scoped graph instance. `task` is new in that stage — every
 * other kind predates it.
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
  | "task";

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
