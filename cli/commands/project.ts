import { Command } from "commander";
import { AshOS } from "../../sdk/ashos";
import type { MilestoneStatus, ProjectStatus, ProjectTaskStatus } from "../../workspace/types";

export function registerProjectCommand(program: Command): void {
  const cmd = program.command("project").description("Project Workspaces: a real, persisted Project/Task/Milestone data model");

  cmd
    .command("create <name>")
    .description("Create a new project")
    .option("-d, --description <description>", "project description")
    .option("-t, --tags <tags>", "comma-separated tags")
    .action(async (name: string, opts) => {
      const ashos = new AshOS();
      const tags = opts.tags ? String(opts.tags).split(",").map((t: string) => t.trim()).filter(Boolean) : undefined;
      const project = await ashos.workspace.createProject(name, opts.description, { tags });
      console.log(`Created project ${project.id}`);
    });

  cmd
    .command("list")
    .description("List projects, newest first")
    .option("-s, --status <status>", 'filter by status: "active", "completed", "archived"')
    .action((opts) => {
      const ashos = new AshOS();
      const projects = ashos.workspace.listProjects({ status: opts.status as ProjectStatus | undefined });
      if (projects.length === 0) {
        console.log("No projects yet. Create one with `ash project create <name>`.");
        return;
      }
      for (const project of projects) {
        console.log(`[${project.status}] ${project.id}  ${project.name}`);
      }
    });

  cmd
    .command("show <id>")
    .description("Show full details for one project")
    .action((id: string) => {
      const ashos = new AshOS();
      const project = ashos.workspace.getProject(id);
      if (!project) {
        console.error(`No project found with id "${id}".`);
        process.exitCode = 1;
        return;
      }
      console.log(JSON.stringify(project, null, 2));
    });

  cmd
    .command("archive <id>")
    .description("Mark a project as archived")
    .action(async (id: string) => {
      const ashos = new AshOS();
      try {
        const project = await ashos.workspace.archiveProject(id);
        console.log(`Archived ${project.id}`);
      } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
      }
    });

  cmd
    .command("progress <id>")
    .description("Show percent-complete for a project, computed from its tasks")
    .action((id: string) => {
      const ashos = new AshOS();
      if (!ashos.workspace.getProject(id)) {
        console.error(`No project found with id "${id}".`);
        process.exitCode = 1;
        return;
      }
      const { totalTasks, doneTasks, percent } = ashos.workspace.progress(id);
      console.log(`${percent}% complete (${doneTasks}/${totalTasks} tasks done)`);
    });

  const task = cmd.command("task").description("Tasks belonging to a project");

  task
    .command("add <projectId> <title...>")
    .description("Add a task to a project")
    .option("-d, --description <description>", "task description")
    .action(async (projectId: string, title: string[], opts) => {
      const ashos = new AshOS();
      try {
        const created = await ashos.workspace.addTask(projectId, title.join(" "), { description: opts.description });
        console.log(`Created task ${created.id}`);
      } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
      }
    });

  task
    .command("list <projectId>")
    .description("List tasks for a project")
    .option("-s, --status <status>", 'filter by status: "todo", "in-progress", "done"')
    .action((projectId: string, opts) => {
      const ashos = new AshOS();
      const tasks = ashos.workspace.listTasks(projectId, { status: opts.status as ProjectTaskStatus | undefined });
      if (tasks.length === 0) {
        console.log("No tasks yet.");
        return;
      }
      for (const t of tasks) console.log(`[${t.status}] ${t.id}  ${t.title}`);
    });

  task
    .command("status <taskId> <status>")
    .description('Update a task\'s status: "todo", "in-progress", "done"')
    .action(async (taskId: string, status: string) => {
      const ashos = new AshOS();
      try {
        const updated = await ashos.workspace.updateTaskStatus(taskId, status as ProjectTaskStatus);
        console.log(`Task ${updated.id} is now [${updated.status}]`);
      } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
      }
    });

  const milestone = cmd.command("milestone").description("Milestones belonging to a project");

  milestone
    .command("add <projectId> <title...>")
    .description("Add a milestone to a project")
    .option("--due <date>", "due date (ISO string)")
    .action(async (projectId: string, title: string[], opts) => {
      const ashos = new AshOS();
      try {
        const created = await ashos.workspace.addMilestone(projectId, title.join(" "), { dueDate: opts.due });
        console.log(`Created milestone ${created.id}`);
      } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
      }
    });

  milestone
    .command("list <projectId>")
    .description("List milestones for a project")
    .option("-s, --status <status>", 'filter by status: "pending", "done"')
    .action((projectId: string, opts) => {
      const ashos = new AshOS();
      const milestones = ashos.workspace.listMilestones(projectId, { status: opts.status as MilestoneStatus | undefined });
      if (milestones.length === 0) {
        console.log("No milestones yet.");
        return;
      }
      for (const m of milestones) console.log(`[${m.status}] ${m.id}  ${m.title}${m.dueDate ? `  (due ${m.dueDate})` : ""}`);
    });

  milestone
    .command("status <milestoneId> <status>")
    .description('Update a milestone\'s status: "pending", "done"')
    .action(async (milestoneId: string, status: string) => {
      const ashos = new AshOS();
      try {
        const updated = await ashos.workspace.updateMilestoneStatus(milestoneId, status as MilestoneStatus);
        console.log(`Milestone ${updated.id} is now [${updated.status}]`);
      } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
      }
    });
}
