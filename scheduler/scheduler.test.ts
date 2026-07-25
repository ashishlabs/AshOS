import { describe, expect, it, afterEach } from "vitest";
import { Scheduler } from "./scheduler";

describe("Scheduler", () => {
  let scheduler: Scheduler;

  afterEach(() => {
    scheduler?.stopAll();
  });

  it("registers valid cron jobs", () => {
    scheduler = new Scheduler();
    scheduler.schedule({ id: "morning", cron: "0 9 * * *", run: () => {} });
    expect(scheduler.list()).toHaveLength(1);
  });

  it("rejects invalid cron expressions", () => {
    scheduler = new Scheduler();
    expect(() => scheduler.schedule({ id: "bad", cron: "not-a-cron", run: () => {} })).toThrow(/invalid cron/);
  });

  it("cancels jobs", () => {
    scheduler = new Scheduler();
    scheduler.schedule({ id: "hourly", cron: "0 * * * *", run: () => {} });
    scheduler.cancel("hourly");
    expect(scheduler.list()).toHaveLength(0);
  });
});
