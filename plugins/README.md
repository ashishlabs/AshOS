# Plugins

Every subdirectory here is a self-contained AshOS plugin: a `manifest.json`
plus an `index.ts` exporting a `Plugin` (see `kernel/types.ts`). Plugins
receive a `PluginHost` (`{ kernel, tools, agents, providers, evolution }`) and
register whatever they contribute — tools, agents, provider factories, or
(see `evolution/plugins/`) Evolution Engine mutations and benchmarks.

The `git` and `shell` plugins here are reference implementations; the core
tools/agents they wrap already ship registered by default in
`sdk/ashos.ts`, so treat them as a template for third-party plugins rather
than something you must load.

See `docs/plugin-development.md` for the full guide.
