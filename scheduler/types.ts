export interface ScheduledJob {
  id: string;
  /** standard 5-field cron expression, e.g. "0 9 * * *" for every morning */
  cron: string;
  description?: string;
  run: () => void | Promise<void>;
}
