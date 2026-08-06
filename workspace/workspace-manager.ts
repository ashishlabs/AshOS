import { randomUUID } from "node:crypto";
import type { EventBus } from "../kernel/event-bus";
import type { MemoryManager } from "../memory/memory-manager";
import type { KnowledgeGraph } from "../graph/knowledge-graph";
import type {
  Milestone,
  MilestoneStatus,
  Project,
  ProjectProgress,
  ProjectStatus,
  ProjectTask,
  ProjectTaskStatus
} from "./types";

const PROJECT_TAG = "workspace-project";
const TASK_TAG = "workspace-task";
const MILESTONE_TAG = "workspace-milestone";

function projectStatusTag(status: ProjectStatus): string {
  return `workspace-project-status:${status}`;
}
function taskStatusTag(status: ProjectTaskStatus): string {
  return `workspace-task-status:${status}`;
}
function milestoneStatusTag(status: MilestoneStatus): string {
  return `workspace-milestone-status:${status}`;
}
function projectKey(id: string): string {
  return `workspace-project:${id}`;
}
function taskKey(id: string): string {
  return `workspace-task:${id}`;
}
function milestoneKey(id: string): string {
  return `workspace-milestone:${id}`;
}

export interface WorkspaceManagerOptions {
  eventBus?: EventBus;
  /** General-purpose Knowledge Graph — best-effort only, same convention as `InboxManager`/`VaultManager`. */
  graph?: KnowledgeGraph;
}

/**
 * Project Workspaces: a real, persisted `Project`/`ProjectTask`/`Milestone`
 * data model — not just a Knowledge Graph `project` node identified by
 * working directory (what `BaseAgent` auto-creates for every agent run).
 * Deliberately has no persistence engine of its own — records are
 * `MemoryManager` project-scope records tagged `workspace-project`/
 * `workspace-task`/`workspace-milestone`, the same reuse convention
 * `InboxManager`/`VaultManager` established. See `docs/project-workspaces.md`.
 */
export class WorkspaceManager {
  constructor(
    private readonly memory: MemoryManager,
    private readonly options: WorkspaceManagerOptions = {}
  ) {}

  // ---------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------

  async createProject(name: string, description = "", opts: { tags?: string[] } = {}): Promise<Project> {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("project name must not be empty");

    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      name: trimmedName,
      description: description.trim(),
      status: "active",
      tags: [...new Set(opts.tags ?? [])],
      createdAt: now,
      updatedAt: now
    };

    await this.persistProject(project);
    this.options.eventBus?.emit("workspace:project-created", { id: project.id, name: project.name });
    this.enrichProjectGraph(project);
    return project;
  }

  getProject(id: string): Project | undefined {
    return this.memory.recall("project", projectKey(id))?.value as Project | undefined;
  }

  listProjects(filter: { status?: ProjectStatus } = {}): Project[] {
    const projects = this.memory
      .query({ scope: "project", tag: PROJECT_TAG })
      .map((r) => r.value as Project)
      .filter((p) => !filter.status || p.status === filter.status);
    return projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateProjectStatus(id: string, status: ProjectStatus): Promise<Project> {
    const project = this.getProject(id);
    if (!project) throw new Error(`project "${id}" not found`);
    project.status = status;
    project.updatedAt = new Date().toISOString();
    await this.persistProject(project);
    this.options.eventBus?.emit("workspace:project-updated", { id, status });
    return project;
  }

  archiveProject(id: string): Promise<Project> {
    return this.updateProjectStatus(id, "archived");
  }

  /** Every prior version of this project, newest first — same `MemoryManager.revisions()` wrapper `VaultManager.history()` established. */
  projectHistory(id: string): Project[] {
    return this.memory.revisions("project", projectKey(id)).map((r) => r.value as Project);
  }

  /** Computed on the fly from `listTasks()` — not stored state. */
  progress(projectId: string): ProjectProgress {
    const tasks = this.listTasks(projectId);
    const doneTasks = tasks.filter((t) => t.status === "done").length;
    return { totalTasks: tasks.length, doneTasks, percent: tasks.length === 0 ? 0 : Math.round((doneTasks / tasks.length) * 100) };
  }

  // ---------------------------------------------------------------------
  // Tasks
  // ---------------------------------------------------------------------

  async addTask(projectId: string, title: string, opts: { description?: string } = {}): Promise<ProjectTask> {
    const project = this.getProject(projectId);
    if (!project) throw new Error(`project "${projectId}" not found`);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) throw new Error("task title must not be empty");

    const now = new Date().toISOString();
    const task: ProjectTask = {
      id: randomUUID(),
      projectId,
      title: trimmedTitle,
      description: (opts.description ?? "").trim(),
      status: "todo",
      createdAt: now,
      updatedAt: now
    };

    await this.persistTask(task);
    this.options.eventBus?.emit("workspace:task-created", { id: task.id, projectId, title: task.title });
    this.enrichTaskGraph(task, project);
    return task;
  }

  getTask(id: string): ProjectTask | undefined {
    return this.memory.recall("project", taskKey(id))?.value as ProjectTask | undefined;
  }

  listTasks(projectId: string, filter: { status?: ProjectTaskStatus } = {}): ProjectTask[] {
    const tasks = this.memory
      .query({ scope: "project", tag: TASK_TAG })
      .map((r) => r.value as ProjectTask)
      .filter((t) => t.projectId === projectId && (!filter.status || t.status === filter.status));
    return tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateTaskStatus(id: string, status: ProjectTaskStatus): Promise<ProjectTask> {
    const task = this.getTask(id);
    if (!task) throw new Error(`task "${id}" not found`);
    task.status = status;
    task.updatedAt = new Date().toISOString();
    await this.persistTask(task);
    this.options.eventBus?.emit("workspace:task-updated", { id, projectId: task.projectId, status });
    return task;
  }

  /** Every prior version of this task, newest first. */
  taskHistory(id: string): ProjectTask[] {
    return this.memory.revisions("project", taskKey(id)).map((r) => r.value as ProjectTask);
  }

  // ---------------------------------------------------------------------
  // Milestones
  // ---------------------------------------------------------------------

  async addMilestone(projectId: string, title: string, opts: { dueDate?: string } = {}): Promise<Milestone> {
    const project = this.getProject(projectId);
    if (!project) throw new Error(`project "${projectId}" not found`);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) throw new Error("milestone title must not be empty");

    const now = new Date().toISOString();
    const milestone: Milestone = {
      id: randomUUID(),
      projectId,
      title: trimmedTitle,
      dueDate: opts.dueDate,
      status: "pending",
      createdAt: now,
      updatedAt: now
    };

    await this.persistMilestone(milestone);
    this.options.eventBus?.emit("workspace:milestone-created", { id: milestone.id, projectId, title: milestone.title });
    this.enrichMilestoneGraph(milestone, project);
    return milestone;
  }

  getMilestone(id: string): Milestone | undefined {
    return this.memory.recall("project", milestoneKey(id))?.value as Milestone | undefined;
  }

  listMilestones(projectId: string, filter: { status?: MilestoneStatus } = {}): Milestone[] {
    const milestones = this.memory
      .query({ scope: "project", tag: MILESTONE_TAG })
      .map((r) => r.value as Milestone)
      .filter((m) => m.projectId === projectId && (!filter.status || m.status === filter.status));
    return milestones.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateMilestoneStatus(id: string, status: MilestoneStatus): Promise<Milestone> {
    const milestone = this.getMilestone(id);
    if (!milestone) throw new Error(`milestone "${id}" not found`);
    milestone.status = status;
    milestone.updatedAt = new Date().toISOString();
    await this.persistMilestone(milestone);
    this.options.eventBus?.emit("workspace:milestone-updated", { id, projectId: milestone.projectId, status });
    return milestone;
  }

  /** Every prior version of this milestone, newest first. */
  milestoneHistory(id: string): Milestone[] {
    return this.memory.revisions("project", milestoneKey(id)).map((r) => r.value as Milestone);
  }

  // ---------------------------------------------------------------------
  // Persistence + graph enrichment
  // ---------------------------------------------------------------------

  private async persistProject(project: Project): Promise<void> {
    await this.memory.remember("project", projectKey(project.id), project, {
      tags: [PROJECT_TAG, projectStatusTag(project.status), ...project.tags]
    });
  }

  private async persistTask(task: ProjectTask): Promise<void> {
    await this.memory.remember("project", taskKey(task.id), task, {
      tags: [TASK_TAG, taskStatusTag(task.status)]
    });
  }

  private async persistMilestone(milestone: Milestone): Promise<void> {
    await this.memory.remember("project", milestoneKey(milestone.id), milestone, {
      tags: [MILESTONE_TAG, milestoneStatusTag(milestone.status)]
    });
  }

  private enrichProjectGraph(project: Project): void {
    if (!this.options.graph) return;
    try {
      this.options.graph.upsertNode({
        kind: "project",
        label: project.name,
        tags: ["workspace", ...project.tags],
        data: { workspaceProjectId: project.id, status: project.status }
      });
    } catch {
      // best-effort — never let graph enrichment fail project creation
    }
  }

  /** Node labels are prefixed with the project name to avoid unrelated tasks across different projects merging into one node — `upsertNode` dedupes by `(kind, label)` alone. */
  private enrichTaskGraph(task: ProjectTask, project: Project): void {
    if (!this.options.graph) return;
    try {
      const taskNode = this.options.graph.upsertNode({
        kind: "todo",
        label: `${project.name}: ${task.title}`,
        data: { workspaceTaskId: task.id }
      });
      const projectNode = this.options.graph.upsertNode({ kind: "project", label: project.name });
      this.options.graph.addEdge(taskNode.id, projectNode.id, "part-of");
    } catch {
      // best-effort — never let graph enrichment fail task creation
    }
  }

  private enrichMilestoneGraph(milestone: Milestone, project: Project): void {
    if (!this.options.graph) return;
    try {
      const milestoneNode = this.options.graph.upsertNode({
        kind: "milestone",
        label: `${project.name}: ${milestone.title}`,
        data: { workspaceMilestoneId: milestone.id }
      });
      const projectNode = this.options.graph.upsertNode({ kind: "project", label: project.name });
      this.options.graph.addEdge(milestoneNode.id, projectNode.id, "part-of");
    } catch {
      // best-effort — never let graph enrichment fail milestone creation
    }
  }
}
