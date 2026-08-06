export type ProjectStatus = "active" | "completed" | "archived";

export interface Project {
  id: string;
  /** Immutable once created — it's also the Knowledge Graph node's dedup key, see `WorkspaceManager.enrichProjectGraph`. */
  name: string;
  description: string;
  status: ProjectStatus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export type ProjectTaskStatus = "todo" | "in-progress" | "done";

export interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: ProjectTaskStatus;
  createdAt: string;
  updatedAt: string;
}

export type MilestoneStatus = "pending" | "done";

export interface Milestone {
  id: string;
  projectId: string;
  title: string;
  dueDate?: string;
  status: MilestoneStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectProgress {
  totalTasks: number;
  doneTasks: number;
  /** 0-100, rounded. 0 for a project with no tasks. */
  percent: number;
}
