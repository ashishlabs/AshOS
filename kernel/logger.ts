import type { EventBus } from "./event-bus";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export interface LogEntry {
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Minimal structured logger. Every entry is also pushed onto the shared
 * EventBus (as a "log" event) so the dashboard / `ash logs` can tail it
 * without depending on stdout.
 */
export class Logger {
  private entries: LogEntry[] = [];
  private level: LogLevel;

  constructor(
    private scope: string,
    opts: { level?: LogLevel; eventBus?: EventBus; maxEntries?: number } = {}
  ) {
    this.level = opts.level ?? "info";
    this.eventBus = opts.eventBus;
    this.maxEntries = opts.maxEntries ?? 1000;
  }

  private eventBus?: EventBus;
  private maxEntries: number;

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.level]) return;
    const entry: LogEntry = { level, message: `[${this.scope}] ${message}`, meta, timestamp: new Date().toISOString() };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) this.entries.shift();
    this.eventBus?.emit("log", entry);
    const line = `${entry.timestamp} ${level.toUpperCase()} ${entry.message}`;
    if (level === "error") console.error(line, meta ?? "");
    else if (level === "warn") console.warn(line, meta ?? "");
    else console.log(line, meta ?? "");
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.write("debug", message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.write("info", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.write("warn", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.write("error", message, meta);
  }

  child(scope: string): Logger {
    const c = new Logger(`${this.scope}:${scope}`, { level: this.level, eventBus: this.eventBus, maxEntries: this.maxEntries });
    return c;
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }
}
