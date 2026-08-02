import { EventEmitter } from "node:events";

export type AshOSEventName =
  | "task:started"
  | "task:finished"
  | "task:failed"
  | "task:skipped"
  | "tool:executed"
  | "agent:started"
  | "agent:finished"
  | "agent:failed"
  | "provider:switched"
  | "plugin:installed"
  | "plugin:loaded"
  | "memory:updated"
  | "permission:requested"
  | "permission:decided"
  | "workflow:started"
  | "workflow:finished"
  | "scheduler:job-fired"
  | "innovation:cycle-started"
  | "innovation:cycle-finished"
  | "innovation:signal-captured"
  | "innovation:opportunity-created"
  | "innovation:opportunity-updated"
  | "innovation:opportunity-status-changed"
  | "innovation:event-created"
  | "innovation:event-merged"
  | "innovation:repository-analyzed"
  | "innovation:radar-updated"
  | "codebase:indexed"
  | "log";

export interface AshOSEvent<T = unknown> {
  name: AshOSEventName;
  timestamp: string;
  payload: T;
}

/**
 * Typed, process-wide event bus. Every subsystem (planner, agents, tools,
 * plugins, scheduler) publishes here so the kernel, CLI, and dashboard can
 * observe execution without being coupled to each other.
 */
export class EventBus {
  private emitter = new EventEmitter();
  private history: AshOSEvent[] = [];
  private maxHistory: number;

  constructor(opts: { maxHistory?: number } = {}) {
    this.maxHistory = opts.maxHistory ?? 500;
    this.emitter.setMaxListeners(0);
  }

  emit<T = unknown>(name: AshOSEventName, payload: T): void {
    const event: AshOSEvent<T> = {
      name,
      timestamp: new Date().toISOString(),
      payload
    };
    this.history.push(event as AshOSEvent);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    this.emitter.emit(name, event);
    this.emitter.emit("*", event);
  }

  on<T = unknown>(name: AshOSEventName | "*", handler: (event: AshOSEvent<T>) => void): () => void {
    this.emitter.on(name, handler as (event: AshOSEvent) => void);
    return () => this.emitter.off(name, handler as (event: AshOSEvent) => void);
  }

  once<T = unknown>(name: AshOSEventName, handler: (event: AshOSEvent<T>) => void): void {
    this.emitter.once(name, handler as (event: AshOSEvent) => void);
  }

  getHistory(filter?: AshOSEventName): AshOSEvent[] {
    return filter ? this.history.filter((e) => e.name === filter) : [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }
}
