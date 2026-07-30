import { describe, expect, it, afterEach, vi } from "vitest";
import { EvolutionScheduler } from "./evolution-scheduler";
import { Scheduler } from "../../scheduler/scheduler";
import type { EvolutionEngine } from "../engine/evolution-engine";
import type { ExperimentRecord } from "../history/types";

function fakeEngine() {
  return { runCycle: vi.fn().mockResolvedValue([] as ExperimentRecord[]) } as unknown as EvolutionEngine;
}

describe("EvolutionScheduler", () => {
  let scheduler: Scheduler;

  afterEach(() => {
    scheduler?.stopAll();
  });

  it("registers a recurring cycle on the shared kernel Scheduler", () => {
    scheduler = new Scheduler();
    const engine = fakeEngine();
    const evolutionScheduler = new EvolutionScheduler(scheduler, engine);

    evolutionScheduler.scheduleCycle({ cron: "0 3 * * *" });

    const jobs = scheduler.list();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe("evolution-cycle");
    expect(jobs[0].cron).toBe("0 3 * * *");
  });

  it("supports a custom job id so multiple schedules can coexist", () => {
    scheduler = new Scheduler();
    const evolutionScheduler = new EvolutionScheduler(scheduler, fakeEngine());

    evolutionScheduler.scheduleCycle({ cron: "0 3 * * *", id: "nightly" });
    evolutionScheduler.scheduleCycle({ cron: "0 * * * *", id: "hourly" });

    expect(scheduler.list().map((j) => j.id).sort()).toEqual(["hourly", "nightly"]);
  });

  it("invokes EvolutionEngine.runCycle with the configured cycle options when the job fires", async () => {
    scheduler = new Scheduler();
    const engine = fakeEngine();
    const evolutionScheduler = new EvolutionScheduler(scheduler, engine);

    evolutionScheduler.scheduleCycle({ cron: "0 3 * * *", maxExperiments: 5, parallelExperiments: 1 });

    const job = scheduler.list().find((j) => j.id === "evolution-cycle");
    await job?.run();

    expect(engine.runCycle).toHaveBeenCalledWith({ maxExperiments: 5, parallelExperiments: 1 });
  });

  it("cancels the scheduled cycle", () => {
    scheduler = new Scheduler();
    const evolutionScheduler = new EvolutionScheduler(scheduler, fakeEngine());
    evolutionScheduler.scheduleCycle({ cron: "0 3 * * *" });

    evolutionScheduler.cancel();
    expect(scheduler.list()).toHaveLength(0);
  });

  it("propagates invalid cron expressions from the underlying Scheduler", () => {
    scheduler = new Scheduler();
    const evolutionScheduler = new EvolutionScheduler(scheduler, fakeEngine());
    expect(() => evolutionScheduler.scheduleCycle({ cron: "not-a-cron" })).toThrow(/invalid cron/);
  });
});
