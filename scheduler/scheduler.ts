import cron, { type ScheduledTask } from "node-cron";
import type { EventBus } from "../kernel/event-bus";
import type { ScheduledJob } from "./types";

/**
 * Cron-based job scheduler for recurring automation ("every morning, check
 * GitHub, summarize, email report"). Jobs are plain functions so they can
 * trigger a workflow, a planner run, or any custom callback.
 */
export class Scheduler {
  private tasks = new Map<string, ScheduledTask>();
  private jobs = new Map<string, ScheduledJob>();

  constructor(private eventBus?: EventBus) {}

  schedule(job: ScheduledJob): void {
    if (!cron.validate(job.cron)) {
      throw new Error(`Scheduler: invalid cron expression "${job.cron}" for job "${job.id}"`);
    }
    this.cancel(job.id);
    const task = cron.schedule(job.cron, async () => {
      this.eventBus?.emit("scheduler:job-fired", { id: job.id });
      await job.run();
    });
    this.tasks.set(job.id, task);
    this.jobs.set(job.id, job);
  }

  cancel(id: string): void {
    this.tasks.get(id)?.stop();
    this.tasks.delete(id);
    this.jobs.delete(id);
  }

  list(): ScheduledJob[] {
    return [...this.jobs.values()];
  }

  stopAll(): void {
    for (const id of [...this.tasks.keys()]) this.cancel(id);
  }
}
