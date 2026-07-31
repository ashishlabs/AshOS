import { Kernel } from "../kernel/kernel";
import { ProviderRegistry } from "../providers/registry";
import { MemoryManager } from "../memory/memory-manager";
import { ToolRegistry } from "../tools/registry";
import { ShellTool } from "../tools/shell-tool";
import { GitTool } from "../tools/git-tool";
import { FsTool } from "../tools/fs-tool";
import { AgentRegistry } from "../agents/registry";
import { GenericAgent } from "../agents/generic-agent";
import { CodeAgent } from "../agents/code-agent";
import { ResearchAgent } from "../agents/research-agent";
import { GitAgent } from "../agents/git-agent";
import { TestingAgent } from "../agents/testing-agent";
import { Planner } from "../planner/planner";
import { TaskExecutor } from "../planner/executor";
import { WorkflowEngine } from "../workflow/workflow-engine";
import { Scheduler } from "../scheduler/scheduler";
import { EvolutionModule } from "../evolution/evolution-module";
import { InnovationModule } from "../innovation/innovation-module";
import type { AgentContext } from "../agents/types";
import type { WorkflowDefinition } from "../workflow/types";
import type { TaskGraph } from "../planner/types";
import type { ChatMessage, ChatOptions } from "../providers/types";

export interface AshOSOptions {
  root?: string;
}

/**
 * Single programmatic entry point for embedding AshOS in another
 * application (a Node script, the CLI, or the REST API). Wires the kernel,
 * provider registry, memory, tools, agents, planner, workflow engine and
 * scheduler together with sensible defaults, while leaving every piece
 * swappable (registerTool/registerAgent/providers.registerFactory).
 */
export class AshOS {
  readonly kernel: Kernel;
  readonly providers: ProviderRegistry;
  readonly memory: MemoryManager;
  readonly tools: ToolRegistry;
  readonly agents: AgentRegistry;
  readonly scheduler: Scheduler;
  readonly evolution: EvolutionModule;
  readonly innovation: InnovationModule;

  constructor(opts: AshOSOptions = {}) {
    this.kernel = new Kernel({ root: opts.root });
    this.providers = new ProviderRegistry(this.kernel.config);
    this.memory = new MemoryManager(this.kernel.root, { eventBus: this.kernel.eventBus, provider: this.providers.active() });
    this.scheduler = new Scheduler(this.kernel.eventBus);

    this.tools = new ToolRegistry();
    this.tools.register(new ShellTool(this.kernel.permissions));
    this.tools.register(new GitTool(this.kernel.permissions));
    this.tools.register(new FsTool());

    this.agents = new AgentRegistry();
    this.agents.register(new GenericAgent());
    this.agents.register(new CodeAgent());
    this.agents.register(new ResearchAgent());
    this.agents.register(new GitAgent());
    this.agents.register(new TestingAgent());

    this.evolution = new EvolutionModule({ kernel: this.kernel, providers: this.providers, scheduler: this.scheduler });
    this.innovation = new InnovationModule({ kernel: this.kernel, providers: this.providers, agents: this.agents, tools: this.tools });
  }

  private agentContext(): AgentContext {
    return {
      provider: this.providers.active(),
      tools: this.tools,
      memory: this.memory,
      eventBus: this.kernel.eventBus,
      cwd: this.kernel.root
    };
  }

  async chat(messages: ChatMessage[], options?: ChatOptions) {
    return this.providers.active().chat(messages, options);
  }

  async plan(goal: string): Promise<TaskGraph> {
    return new Planner(this.providers.active()).plan(goal);
  }

  async run(goal: string) {
    const graph = await this.plan(goal);
    const executor = new TaskExecutor({ agents: this.agents, agentContext: this.agentContext(), eventBus: this.kernel.eventBus });
    return { graph, results: await executor.execute(graph) };
  }

  async runWorkflow(definition: WorkflowDefinition) {
    const engine = new WorkflowEngine({
      agents: this.agents,
      tools: this.tools,
      agentContext: this.agentContext(),
      eventBus: this.kernel.eventBus
    });
    return engine.run(definition);
  }

  async loadPlugins(dir: string = `${this.kernel.root}/plugins`): Promise<string[]> {
    const loaded = await this.kernel.plugins.loadFromDirectory(dir, {
      kernel: this.kernel,
      tools: this.tools,
      agents: this.agents,
      providers: this.providers,
      evolution: { mutations: this.evolution.mutations, benchmarks: this.evolution.benchmarks },
      innovation: { collectors: this.innovation.collectors }
    });
    for (const name of loaded) this.kernel.eventBus.emit("plugin:installed", { name });
    return loaded;
  }
}
