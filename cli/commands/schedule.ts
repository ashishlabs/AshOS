import { Command } from "commander";
import { AshOS } from "../../sdk/ashos";
import type { ScheduleTarget } from "../../scheduler/types";

export function registerScheduleCommand(program: Command): void {
  const cmd = program
    .command("schedule")
    .description("Recurring jobs (a goal or a workflow file, run on a cron schedule) — only fire while the API server is running");

  cmd
    .command("add <cron>")
    .description('Schedule a recurring job, e.g. `ash schedule add "0 9 * * *" --goal "..."`')
    .option("-g, --goal <goal>", "a natural-language goal to plan and execute on this schedule (mutually exclusive with --workflow)")
    .option("-w, --workflow <file>", "a workflow JSON file to run on this schedule (mutually exclusive with --goal)")
    .option("-d, --description <description>", "human-readable description")
    .action(async (cron: string, opts: { goal?: string; workflow?: string; description?: string }) => {
      if (Boolean(opts.goal) === Boolean(opts.workflow)) {
        console.error("Provide exactly one of --goal or --workflow.");
        process.exitCode = 1;
        return;
      }
      const target: ScheduleTarget = opts.goal ? { kind: "goal", goal: opts.goal } : { kind: "workflow", file: opts.workflow! };

      const ashos = new AshOS();
      try {
        const schedule = ashos.scheduleStore.add({ cron, description: opts.description, target });
        console.log(`Scheduled ${schedule.id} (${schedule.cron}) — will run while \`ash api\` is running.`);
      } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
      }
    });

  cmd
    .command("list")
    .description("List scheduled jobs")
    .action(() => {
      const ashos = new AshOS();
      const schedules = ashos.scheduleStore.list();
      if (schedules.length === 0) {
        console.log("No scheduled jobs yet. Add one with `ash schedule add`.");
        return;
      }
      for (const schedule of schedules) {
        const targetLabel = schedule.target.kind === "goal" ? `goal: "${schedule.target.goal}"` : `workflow: ${schedule.target.file}`;
        console.log(`${schedule.id}  [${schedule.cron}]  ${targetLabel}${schedule.description ? `  — ${schedule.description}` : ""}`);
      }
    });

  cmd
    .command("remove <id>")
    .description("Remove a scheduled job")
    .action((id: string) => {
      const ashos = new AshOS();
      if (!ashos.scheduleRemove(id)) {
        console.error(`No scheduled job found with id "${id}".`);
        process.exitCode = 1;
        return;
      }
      console.log(`Removed ${id}.`);
    });
}
