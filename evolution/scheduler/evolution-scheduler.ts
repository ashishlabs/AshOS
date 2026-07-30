import type { Scheduler } from "../../scheduler/scheduler";
import type { EvolutionEngine } from "../engine/evolution-engine";
import type { EvolutionCycleOptions } from "../engine/types";

export interface EvolutionScheduleOptions extends EvolutionCycleOptions {
  cron: string;
  id?: string;
}

const DEFAULT_JOB_ID = "evolution-cycle";

/**
 * Wires recurring evolution cycles into the existing kernel Scheduler
 * rather than running a separate cron loop — "every night, run an
 * evolution cycle" is just another scheduled job.
 */
export class EvolutionScheduler {
  constructor(
    private readonly scheduler: Scheduler,
    private readonly engine: EvolutionEngine
  ) {}

  scheduleCycle(options: EvolutionScheduleOptions): void {
    const { cron, id = DEFAULT_JOB_ID, ...cycleOptions } = options;
    this.scheduler.schedule({
      id,
      cron,
      description: "Recurring Evolution Engine cycle",
      run: async () => {
        await this.engine.runCycle(cycleOptions);
      }
    });
  }

  cancel(id: string = DEFAULT_JOB_ID): void {
    this.scheduler.cancel(id);
  }
}
