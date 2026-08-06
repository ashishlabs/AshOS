export interface ScheduledJob {
  id: string;
  /** standard 5-field cron expression, e.g. "0 9 * * *" for every morning */
  cron: string;
  description?: string;
  run: () => void | Promise<void>;
}

/** What a persisted, user-created recurring job actually does when it fires — reuses the exact same entry points `ash run`/`ash workflow run` already use, no new execution path. */
export type ScheduleTarget = { kind: "goal"; goal: string } | { kind: "workflow"; file: string };

/**
 * A recurring job definition durable across process restarts — `Scheduler`
 * itself is in-memory only, so `ash schedule add`/`POST /scheduler` persist
 * here instead; a long-running process (the API server) reads this back on
 * startup and registers each entry on `Scheduler` for real. See
 * `AshOS.loadPersistedSchedules()`.
 */
export interface PersistedSchedule {
  id: string;
  cron: string;
  description?: string;
  target: ScheduleTarget;
  createdAt: string;
}
