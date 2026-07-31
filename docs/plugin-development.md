# Plugin Development Guide

A plugin is a directory under `plugins/` with:

```
plugins/my-plugin/
  manifest.json
  index.ts
```

## manifest.json

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "What this plugin adds",
  "provides": ["tool:my-tool", "agent:my-capability"]
}
```

## index.ts

```ts
import type { Plugin } from "../../kernel/types";
import manifest from "./manifest.json";

export const plugin: Plugin = {
  manifest,
  register(host) {
    // host: { kernel, tools, agents, providers }
    host.tools.register(myTool);
    host.agents.register(myAgent);
    host.providers.registerFactory("my-provider", () => new MyProvider());
  }
};

export default plugin;
```

`register` is called once, synchronously or asynchronously, with a
`PluginHost` giving access to:

- `host.kernel` — event bus, logger, permission manager, config
- `host.tools` — a `ToolRegistry` to add new `Tool` implementations to
- `host.agents` — an `AgentRegistry` to add new `Agent` implementations to
- `host.providers` — a `ProviderRegistry` to register new `AIProvider` factories
- `host.innovation` — `{ collectors }`, a `CollectorRegistry` for Innovation
  Intelligence (e.g. a real GitHub/Hacker News/arXiv collector); see `docs/innovation.md`

## Writing a Tool

Implement the `Tool` interface (`tools/types.ts`):

```ts
class MyTool implements Tool {
  capabilities() { return { name: "my-tool", description: "...", actions: ["run"] }; }
  requirements() { return { binaries: ["my-cli"] }; }
  permissions() { return { dangerous: false }; }
  async healthCheck() { return { healthy: true }; }
  async execute(req) { /* ... */ return { ok: true, output: "..." }; }
}
```

If your tool can perform destructive actions, route them through the
`PermissionManager` passed into your plugin via `host.kernel.permissions`
(see `tools/shell-tool.ts` and `tools/git-tool.ts` for the pattern).

## Writing an Agent

Extend `BaseAgent` (`agents/base-agent.ts`) and declare the capability
tag(s) your agent should be routed to by the Planner/Workflow engine:

```ts
class MyAgent extends BaseAgent {
  name = "my-agent";
  description = "...";
  capabilities = ["my-capability"];

  async run(task, context) {
    const { content } = await context.provider.chat([...]);
    return { ok: true, output: content };
  }
}
```

## Writing a Provider

Implement `AIProvider` (`providers/types.ts`) and register a factory via
`host.providers.registerFactory("name", () => new MyProvider())`. See
`providers/ollama-provider.ts` for a minimal fetch-based example.

## Loading plugins

```
ash plugin list
ash plugin install <name>
```

or programmatically:

```ts
const ashos = new AshOS();
await ashos.loadPlugins(); // defaults to ./plugins
```

Registry-based `ash plugin install <name>` (downloading a published
plugin) is on the roadmap — v0.1 loads plugins local-first from the
`plugins/` directory.
