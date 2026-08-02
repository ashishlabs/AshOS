# Feature: Plugin System

**Status:** ✅ Complete (2 reference plugins; local-only, no registry install yet)

## 1. What is this feature?

Plugins let you extend AshOS — add a new tool, agent, or AI provider —
without touching AshOS's own source code. A plugin is just a directory
with a `manifest.json` and an `index.ts` that registers itself against a
`PluginHost` (tools, agents, providers, kernel). AshOS ships two
reference plugins (`git`, `shell`) showing the exact pattern to follow.

**Business value:** this is how AshOS grows to fit *your* workflow
specifically — a custom internal tool, a proprietary AI provider, a
company-specific agent — without forking the project or waiting for it
to be built into core.

## 2. Who is this for?

- **Developers who want to add a capability AshOS doesn't have** (a new
  tool, provider, or agent) and want it to feel native — same
  registries, same event bus, same CLI/REST discoverability.

## 3. How to use it

**See what's loaded:**
```bash
ash plugin list
```

**Load a plugin** (must live under `./plugins/<name>/`):
```bash
ash plugin install <name>
```

**Write your own plugin** — create `plugins/my-plugin/manifest.json` and
`plugins/my-plugin/index.ts`:
```json
{ "name": "my-plugin", "version": "1.0.0", "description": "Adds a custom tool" }
```
```ts
import type { Plugin } from "ashos/plugins/types";

export const plugin: Plugin = {
  manifest: { name: "my-plugin", version: "1.0.0" },
  register(host) {
    host.tools.register(new MyCustomTool());
    // host.agents.register(...), host.providers.registerFactory(...) also available
  }
};
```
Then: `ash plugin install my-plugin`.

## 4. Example walkthrough

You want a custom "Slack notifier" tool your workflows can use:

1. `mkdir -p plugins/slack-notifier`
2. Write `manifest.json` and `index.ts` implementing the `Tool`
   interface (capabilities/requirements/permissions/healthCheck/execute).
3. `ash plugin install slack-notifier`
4. Reference it in a workflow step: `{ "uses": "tool:slack-notifier", ... }`.

## 5. Tips & limitations

- **Local-only today** — `ash plugin install <name>` loads from
  `./plugins/<name>/`, there's no community registry to `npm install`
  a plugin from yet (see `docs/roadmap.md`).
- Study the existing `plugins/git-plugin/` and `plugins/shell-plugin/`
  reference implementations before writing your own — they show the
  exact `Plugin`/`PluginHost` contract in practice.
- Full technical detail: `docs/plugin-development.md`.
