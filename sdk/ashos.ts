import { Kernel } from "../kernel/kernel";
import { ProviderRegistry } from "../providers/registry";
import { ModelRouter } from "../providers/router";
import { MemoryManager } from "../memory/memory-manager";
import { ToolRegistry } from "../tools/registry";
import { ShellTool } from "../tools/shell-tool";
import { GitTool } from "../tools/git-tool";
import { FsTool } from "../tools/fs-tool";
import { WebFetchTool } from "../tools/web-fetch-tool";
import { AgentRegistry } from "../agents/registry";
import { GenericAgent } from "../agents/generic-agent";
import { CodeAgent } from "../agents/code-agent";
import { ResearchAgent } from "../agents/research-agent";
import { GitAgent } from "../agents/git-agent";
import { TestingAgent } from "../agents/testing-agent";
import { GitHubTrendingAgent } from "../agents/github-trending-agent";
import { ReflectionAgent } from "../agents/reflection-agent";
import { ReviewerAgent } from "../agents/reviewer-agent";
import { SecurityAuditorAgent } from "../agents/security-auditor-agent";
import { DevOpsAgent } from "../agents/devops-agent";
import { UIDesignerAgent } from "../agents/ui-designer-agent";
import { ArchitectAgent } from "../agents/architect-agent";
import { Planner } from "../planner/planner";
import { TaskExecutor } from "../planner/executor";
import { WorkflowEngine } from "../workflow/workflow-engine";
import { Scheduler } from "../scheduler/scheduler";
import { InnovationModule } from "../innovation/innovation-module";
import { CodebaseAnalystAgent } from "../codebase/agents/codebase-analyst-agent";
import { CodebaseIndexStore } from "../codebase/codebase-store";
import { KnowledgeGraph } from "../graph/knowledge-graph";
import { InboxManager } from "../inbox/inbox-manager";
import { VaultManager } from "../vault/vault-manager";
import { WorkspaceManager } from "../workspace/workspace-manager";
import { HybridSearch } from "../search/hybrid-search";
import { saveReflection, type SavedReflection } from "../agents/reflection-store";
import type { ReflectionData, ReflectionPeriod } from "../agents/reflection";
import type { Agent, AgentContext, AgentResult } from "../agents/types";
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
  readonly router: ModelRouter;
  readonly memory: MemoryManager;
  readonly tools: ToolRegistry;
  readonly agents: AgentRegistry;
  readonly scheduler: Scheduler;
  readonly innovation: InnovationModule;
  readonly codebase: CodebaseIndexStore;
  /** General-purpose, project-wide Knowledge Graph (`.ashos/graph.json`) — distinct from Innovation Intelligence's own namespaced graph at `.ashos/innovation/graph.json`. See `docs/knowledge-graph.md`. */
  readonly knowledgeGraph: KnowledgeGraph;
  /** Universal Inbox — the single capture point everything enters AshOS through. See `docs/inbox.md`. */
  readonly inbox: InboxManager;
  /** Knowledge Vault — curated, long-form notes with links between them, one step further triaged than a raw Inbox capture. See `docs/knowledge-vault.md`. */
  readonly vault: VaultManager;
  /** Project Workspaces — a real, persisted Project/Task/Milestone data model, distinct from the label-only `project` Knowledge Graph node `BaseAgent` auto-creates. See `docs/project-workspaces.md`. */
  readonly workspace: WorkspaceManager;
  /** Cross-store hybrid search over Memory, the general Knowledge Graph, the Inbox, the Vault, and Project Workspaces. See `docs/search.md`. */
  readonly search: HybridSearch;

  constructor(opts: AshOSOptions = {}) {
    this.kernel = new Kernel({ root: opts.root });
    this.providers = new ProviderRegistry(this.kernel.config);
    this.router = new ModelRouter(this.providers, this.kernel.config.router);
    this.memory = new MemoryManager(this.kernel.root, { eventBus: this.kernel.eventBus, provider: this.providers.active() });
    this.scheduler = new Scheduler(this.kernel.eventBus);
    this.codebase = new CodebaseIndexStore(this.kernel.root);
    this.knowledgeGraph = new KnowledgeGraph(this.kernel.root);
    const webFetchTool = new WebFetchTool();
    this.inbox = new InboxManager(this.memory, {
      eventBus: this.kernel.eventBus,
      graph: this.knowledgeGraph,
      provider: this.providers.active(),
      webFetch: webFetchTool
    });
    this.vault = new VaultManager(this.memory, { eventBus: this.kernel.eventBus, graph: this.knowledgeGraph });
    this.workspace = new WorkspaceManager(this.memory, { eventBus: this.kernel.eventBus, graph: this.knowledgeGraph });
    this.search = new HybridSearch(this.memory, this.knowledgeGraph, this.inbox, this.vault, this.workspace);

    this.tools = new ToolRegistry();
    this.tools.register(new ShellTool(this.kernel.permissions));
    this.tools.register(new GitTool(this.kernel.permissions));
    this.tools.register(new FsTool());
    this.tools.register(webFetchTool);

    this.agents = new AgentRegistry();
    this.agents.register(new GenericAgent());
    this.agents.register(new CodeAgent());
    this.agents.register(new ResearchAgent());
    this.agents.register(new GitAgent());
    this.agents.register(new TestingAgent());
    this.agents.register(new GitHubTrendingAgent());
    this.agents.register(new ReflectionAgent());
    this.agents.register(new ReviewerAgent());
    this.agents.register(new SecurityAuditorAgent());
    this.agents.register(new DevOpsAgent());
    this.agents.register(new UIDesignerAgent());
    this.agents.register(new ArchitectAgent());
    this.agents.register(new CodebaseAnalystAgent(this.codebase));

    this.innovation = new InnovationModule({ kernel: this.kernel, providers: this.providers, agents: this.agents, tools: this.tools });
  }

  private agentContext(): AgentContext {
    return {
      provider: this.providers.active(),
      tools: this.tools,
      memory: this.memory,
      eventBus: this.kernel.eventBus,
      cwd: this.kernel.root,
      router: this.router,
      graph: this.knowledgeGraph
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

  /** Runs a single registered agent directly by capability, bypassing the planner — for on-demand, deterministic capabilities like `github-trending` that don't need an LLM to decide how to invoke them. */
  async runAgent(capability: string, task: { description: string; input?: Record<string, unknown> }): Promise<AgentResult> {
    const agent: Agent | undefined = this.agents.findByCapability(capability);
    if (!agent) throw new Error(`no agent registered for capability "${capability}"`);
    return agent.execute({ id: `${capability}-${Date.now()}`, description: task.description, input: task.input }, this.agentContext());
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

  /**
   * Generates a reflection narrative (same as `runAgent("reflection", ...)`)
   * and saves it to `.ashos/reflections/<period>-<date>.json` — see
   * `agents/reflection-store.ts`. This is what `startScheduledJobs()`'s
   * daily job calls, and what `GET /reflect`/`ash reflect` call when asked
   * to save (`?save=true` / `--save`) instead of just printing.
   */
  async generateAndSaveReflection(period: ReflectionPeriod = "daily"): Promise<SavedReflection> {
    const result = await this.runAgent("reflection", { description: `reflect (${period})`, input: { period } });
    if (!result.ok) throw new Error(result.error ?? "reflection agent failed");
    const data = result.data as ReflectionData & { narrative: string };
    const saved: SavedReflection = { ...data, generatedAt: new Date().toISOString() };
    saveReflection(this.kernel.root, saved);
    this.kernel.eventBus.emit("reflection:generated", { period });
    return saved;
  }

  /**
   * Registers AshOS's default recurring jobs on `this.scheduler` — today,
   * just the daily reflection (`config.reflection`, on by default). Not
   * called from the constructor: cron-based scheduling only means anything
   * for a process that stays alive (the API server), so this must be
   * called explicitly from that long-running entry point, never from a
   * short-lived CLI invocation or from test code that merely constructs an
   * `AshOS` instance — see `api/server.ts`'s `require.main === module`
   * block, the only real caller.
   */
  startScheduledJobs(): void {
    if (!this.kernel.config.reflection.enabled) return;
    this.scheduler.schedule({
      id: "daily-reflection",
      cron: this.kernel.config.reflection.cron,
      run: async () => {
        await this.generateAndSaveReflection("daily");
      }
    });
  }

  async loadPlugins(dir: string = `${this.kernel.root}/plugins`): Promise<string[]> {
    const loaded = await this.kernel.plugins.loadFromDirectory(dir, {
      kernel: this.kernel,
      tools: this.tools,
      agents: this.agents,
      providers: this.providers,
      innovation: { collectors: this.innovation.collectors }
    });
    for (const name of loaded) this.kernel.eventBus.emit("plugin:installed", { name });
    return loaded;
  }
}
