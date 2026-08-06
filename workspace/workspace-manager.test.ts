import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../kernel/event-bus";
import { MemoryManager } from "../memory/memory-manager";
import { KnowledgeGraph } from "../graph/knowledge-graph";
import { WorkspaceManager } from "./workspace-manager";

describe("WorkspaceManager", () => {
  let root: string;
  let memory: MemoryManager;
  let eventBus: EventBus;
  let graph: KnowledgeGraph;
  let workspace: WorkspaceManager;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-workspace-"));
    memory = new MemoryManager(root, { globalDir: root });
    eventBus = new EventBus();
    graph = new KnowledgeGraph(root);
    workspace = new WorkspaceManager(memory, { eventBus, graph });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe("projects", () => {
    it("creates a project with default status active", async () => {
      const project = await workspace.createProject("Website redesign", "Refresh the marketing site");
      expect(project.id).toBeTruthy();
      expect(project.name).toBe("Website redesign");
      expect(project.status).toBe("active");
    });

    it("rejects an empty name", async () => {
      await expect(workspace.createProject("   ")).rejects.toThrow(/empty/);
    });

    it("persists projects via MemoryManager and round-trips through getProject()", async () => {
      const created = await workspace.createProject("A project");
      expect(workspace.getProject(created.id)).toEqual(created);
    });

    it("lists projects newest first, filterable by status", async () => {
      const first = await workspace.createProject("First");
      await new Promise((r) => setTimeout(r, 2));
      const second = await workspace.createProject("Second");
      await workspace.archiveProject(first.id);

      const all = workspace.listProjects();
      expect(all[0].id).toBe(second.id);
      expect(all[1].id).toBe(first.id);
      expect(workspace.listProjects({ status: "archived" })).toHaveLength(1);
      expect(workspace.listProjects({ status: "active" })).toHaveLength(1);
    });

    it("archiveProject updates status", async () => {
      const project = await workspace.createProject("Archive me");
      const archived = await workspace.archiveProject(project.id);
      expect(archived.status).toBe("archived");
    });

    it("throws when updating the status of an unknown project", async () => {
      await expect(workspace.updateProjectStatus("does-not-exist", "completed")).rejects.toThrow(/not found/);
    });

    it("projectHistory() is empty until updated, then reflects the prior version", async () => {
      const project = await workspace.createProject("Archive me");
      expect(workspace.projectHistory(project.id)).toEqual([]);

      await workspace.archiveProject(project.id);
      const history = workspace.projectHistory(project.id);
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe("active");
    });

    it("best-effort enriches the knowledge graph with a project node", async () => {
      await workspace.createProject("Website redesign", "desc", { tags: ["marketing"] });
      const nodes = graph.listNodes({ kind: "project" });
      expect(nodes).toHaveLength(1);
      expect(nodes[0].label).toBe("Website redesign");
      expect(nodes[0].tags).toContain("marketing");
    });

    it("works without a graph or event bus (both optional)", async () => {
      const bare = new WorkspaceManager(memory);
      const project = await bare.createProject("bare project");
      expect(project.status).toBe("active");
    });
  });

  describe("tasks", () => {
    it("adds a task under a project with default status todo", async () => {
      const project = await workspace.createProject("A project");
      const task = await workspace.addTask(project.id, "Write docs");
      expect(task.projectId).toBe(project.id);
      expect(task.status).toBe("todo");
    });

    it("throws when adding a task to an unknown project", async () => {
      await expect(workspace.addTask("does-not-exist", "Write docs")).rejects.toThrow(/not found/);
    });

    it("rejects an empty task title", async () => {
      const project = await workspace.createProject("A project");
      await expect(workspace.addTask(project.id, "  ")).rejects.toThrow(/empty/);
    });

    it("lists only tasks belonging to the given project", async () => {
      const a = await workspace.createProject("A");
      const b = await workspace.createProject("B");
      await workspace.addTask(a.id, "Task for A");
      await workspace.addTask(b.id, "Task for B");

      expect(workspace.listTasks(a.id)).toHaveLength(1);
      expect(workspace.listTasks(a.id)[0].title).toBe("Task for A");
    });

    it("filters tasks by status", async () => {
      const project = await workspace.createProject("A project");
      const task = await workspace.addTask(project.id, "Do it");
      await workspace.addTask(project.id, "Do it later");
      await workspace.updateTaskStatus(task.id, "done");

      expect(workspace.listTasks(project.id, { status: "done" })).toHaveLength(1);
      expect(workspace.listTasks(project.id, { status: "todo" })).toHaveLength(1);
    });

    it("throws when updating the status of an unknown task", async () => {
      await expect(workspace.updateTaskStatus("does-not-exist", "done")).rejects.toThrow(/not found/);
    });

    it("taskHistory() reflects the prior version after a status update", async () => {
      const project = await workspace.createProject("A project");
      const task = await workspace.addTask(project.id, "Do it");
      expect(workspace.taskHistory(task.id)).toEqual([]);

      await workspace.updateTaskStatus(task.id, "done");
      const history = workspace.taskHistory(task.id);
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe("todo");
    });

    it("best-effort enriches the knowledge graph with a todo node linked to its project", async () => {
      const project = await workspace.createProject("Website redesign");
      await workspace.addTask(project.id, "Write docs");

      const todoNodes = graph.listNodes({ kind: "todo" });
      expect(todoNodes).toHaveLength(1);
      expect(todoNodes[0].label).toBe("Website redesign: Write docs");

      const edges = graph.listEdges();
      expect(edges.some((e) => e.from === todoNodes[0].id && e.kind === "part-of")).toBe(true);
    });
  });

  describe("milestones", () => {
    it("adds a milestone under a project with default status pending", async () => {
      const project = await workspace.createProject("A project");
      const milestone = await workspace.addMilestone(project.id, "Launch", { dueDate: "2026-09-01" });
      expect(milestone.projectId).toBe(project.id);
      expect(milestone.status).toBe("pending");
      expect(milestone.dueDate).toBe("2026-09-01");
    });

    it("throws when adding a milestone to an unknown project", async () => {
      await expect(workspace.addMilestone("does-not-exist", "Launch")).rejects.toThrow(/not found/);
    });

    it("lists only milestones belonging to the given project", async () => {
      const a = await workspace.createProject("A");
      const b = await workspace.createProject("B");
      await workspace.addMilestone(a.id, "Milestone A");
      await workspace.addMilestone(b.id, "Milestone B");

      expect(workspace.listMilestones(a.id)).toHaveLength(1);
      expect(workspace.listMilestones(a.id)[0].title).toBe("Milestone A");
    });

    it("updates milestone status", async () => {
      const project = await workspace.createProject("A project");
      const milestone = await workspace.addMilestone(project.id, "Launch");
      const done = await workspace.updateMilestoneStatus(milestone.id, "done");
      expect(done.status).toBe("done");
    });

    it("milestoneHistory() reflects the prior version after a status update", async () => {
      const project = await workspace.createProject("A project");
      const milestone = await workspace.addMilestone(project.id, "Launch");
      expect(workspace.milestoneHistory(milestone.id)).toEqual([]);

      await workspace.updateMilestoneStatus(milestone.id, "done");
      const history = workspace.milestoneHistory(milestone.id);
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe("pending");
    });

    it("best-effort enriches the knowledge graph with a milestone node linked to its project", async () => {
      const project = await workspace.createProject("Website redesign");
      await workspace.addMilestone(project.id, "Launch");

      const milestoneNodes = graph.listNodes({ kind: "milestone" });
      expect(milestoneNodes).toHaveLength(1);
      expect(milestoneNodes[0].label).toBe("Website redesign: Launch");

      const edges = graph.listEdges();
      expect(edges.some((e) => e.from === milestoneNodes[0].id && e.kind === "part-of")).toBe(true);
    });
  });

  describe("progress", () => {
    it("is 0% for a project with no tasks", async () => {
      const project = await workspace.createProject("A project");
      expect(workspace.progress(project.id)).toEqual({ totalTasks: 0, doneTasks: 0, percent: 0 });
    });

    it("computes percent complete from task statuses", async () => {
      const project = await workspace.createProject("A project");
      const t1 = await workspace.addTask(project.id, "one");
      await workspace.addTask(project.id, "two");
      await workspace.addTask(project.id, "three");
      await workspace.updateTaskStatus(t1.id, "done");

      expect(workspace.progress(project.id)).toEqual({ totalTasks: 3, doneTasks: 1, percent: 33 });
    });
  });

  it("emits every workspace:* event", async () => {
    const seen: string[] = [];
    eventBus.on("workspace:project-created", () => seen.push("project-created"));
    eventBus.on("workspace:project-updated", () => seen.push("project-updated"));
    eventBus.on("workspace:task-created", () => seen.push("task-created"));
    eventBus.on("workspace:task-updated", () => seen.push("task-updated"));
    eventBus.on("workspace:milestone-created", () => seen.push("milestone-created"));
    eventBus.on("workspace:milestone-updated", () => seen.push("milestone-updated"));

    const project = await workspace.createProject("A project");
    await workspace.updateProjectStatus(project.id, "completed");
    const task = await workspace.addTask(project.id, "a task");
    await workspace.updateTaskStatus(task.id, "done");
    const milestone = await workspace.addMilestone(project.id, "a milestone");
    await workspace.updateMilestoneStatus(milestone.id, "done");

    expect(seen).toEqual([
      "project-created",
      "project-updated",
      "task-created",
      "task-updated",
      "milestone-created",
      "milestone-updated"
    ]);
  });
});
