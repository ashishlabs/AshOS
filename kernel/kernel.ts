import path from "node:path";
import { EventBus } from "./event-bus";
import { Logger } from "./logger";
import { PermissionManager } from "./permission-manager";
import { PluginManager } from "./plugin-manager";
import { AgentRouter } from "./agent-router";
import { ContextManager } from "./context-manager";
import { ashosDir, loadConfig, saveConfig, type AshOSConfig } from "./config";

export interface KernelOptions {
  root?: string;
  config?: AshOSConfig;
}

/**
 * Composition root. Everything else in AshOS (providers, memory, planner,
 * agents, tools, workflow engine, scheduler, CLI, API) is handed a Kernel
 * instance instead of reaching for globals, which keeps the system testable
 * and keeps every subsystem replaceable via plugins.
 */
export class Kernel {
  readonly root: string;
  readonly config: AshOSConfig;
  readonly eventBus: EventBus;
  readonly logger: Logger;
  readonly permissions: PermissionManager;
  readonly plugins: PluginManager;
  readonly agentRouter: AgentRouter;
  readonly contextManager: ContextManager;

  constructor(opts: KernelOptions = {}) {
    this.root = opts.root ?? process.cwd();
    this.config = opts.config ?? loadConfig(this.root);
    this.eventBus = new EventBus();
    this.logger = new Logger("kernel", { eventBus: this.eventBus });
    this.permissions = new PermissionManager(path.join(ashosDir(this.root), "permissions.json"), this.eventBus);
    this.plugins = new PluginManager(this.eventBus);
    this.agentRouter = new AgentRouter();
    this.contextManager = new ContextManager(this.root);
  }

  updateConfig(patch: Partial<AshOSConfig>): AshOSConfig {
    Object.assign(this.config, patch);
    saveConfig(this.config, this.root);
    return this.config;
  }
}
