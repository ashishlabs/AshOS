# Evolution plugins

Same contract as `plugins/` at the repo root (`manifest.json` + `index.ts`
exporting a `Plugin`), loaded the same way — but these register into
`host.evolution.mutations` / `host.evolution.benchmarks` instead of
`host.tools` / `host.agents`.

`evolution-extras/` is the reference implementation: a `comment-strip`
mutation (a "context compression" lever — strips single-line comments to
cut token usage without changing behavior) and a `documentation-summary`
benchmark. Neither ships registered by default in `EvolutionModule`
(see `evolution/evolution-module.ts` for the four that do); load this
directory explicitly to see how a third party would add more:

```ts
await ashos.loadPlugins("evolution/plugins");
```

See `docs/plugin-development.md` for the general plugin guide and
`docs/evolution.md` for how mutations/benchmarks fit into the engine.
