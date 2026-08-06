import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import cron from "node-cron";
import type { PersistedSchedule, ScheduleTarget } from "./types";

/**
 * Persists user-created recurring job definitions to
 * `.ashos/schedules.json` so `ash schedule add` / `POST /scheduler` mean
 * something beyond the calling process's lifetime — `Scheduler` is
 * in-memory only and rebuilt fresh on every process start, so anything
 * registered from a short-lived CLI invocation would otherwise vanish the
 * instant that process exits. A long-running process (the API server)
 * reads this back on startup via `AshOS.loadPersistedSchedules()` and
 * registers each entry on the real `Scheduler`. Same single-JSON-file
 * read-modify-write pattern as `MemoryManager`/`KnowledgeGraph`.
 */
export class ScheduleStore {
  private file: string;

  constructor(root: string) {
    this.file = path.join(root, ".ashos", "schedules.json");
  }

  private read(): PersistedSchedule[] {
    try {
      return JSON.parse(fs.readFileSync(this.file, "utf-8"));
    } catch {
      return [];
    }
  }

  private write(schedules: PersistedSchedule[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(schedules, null, 2));
  }

  add(input: { cron: string; description?: string; target: ScheduleTarget }): PersistedSchedule {
    if (!cron.validate(input.cron)) {
      throw new Error(`invalid cron expression "${input.cron}"`);
    }
    const schedule: PersistedSchedule = {
      id: randomUUID(),
      cron: input.cron,
      description: input.description,
      target: input.target,
      createdAt: new Date().toISOString()
    };
    const schedules = this.read();
    schedules.push(schedule);
    this.write(schedules);
    return schedule;
  }

  list(): PersistedSchedule[] {
    return this.read();
  }

  get(id: string): PersistedSchedule | undefined {
    return this.read().find((s) => s.id === id);
  }

  /** Returns `true` if a schedule with this id existed and was removed. */
  remove(id: string): boolean {
    const schedules = this.read();
    const next = schedules.filter((s) => s.id !== id);
    if (next.length === schedules.length) return false;
    this.write(next);
    return true;
  }
}
