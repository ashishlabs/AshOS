export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  /** capability tags this plugin contributes, e.g. ["tool:git", "agent:code"] */
  provides?: string[];
  requires?: string[];
}

/** Everything a plugin needs to extend AshOS: kernel primitives plus the registries it can contribute to. */
export interface PluginHost {
  kernel: import("./kernel").Kernel;
  tools: import("../tools/registry").ToolRegistry;
  agents: import("../agents/registry").AgentRegistry;
  providers: import("../providers/registry").ProviderRegistry;
  /** Lets a plugin contribute Evolution Engine mutations/benchmarks the same way it contributes tools/agents. */
  evolution: {
    mutations: import("../evolution/mutation/registry").MutationRegistry;
    benchmarks: import("../evolution/benchmark/registry").BenchmarkRegistry;
  };
}

export interface Plugin {
  manifest: PluginManifest;
  /** Called once when the plugin is loaded; receives the PluginHost. */
  register: (host: PluginHost) => void | Promise<void>;
}

export interface CapabilityDescriptor {
  /** e.g. "agent:code", "tool:git" */
  capability: string;
  owner: string;
}
