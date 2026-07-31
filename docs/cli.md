# CLI Reference

```
ash init [--provider <name>] [--force]   Initialize .ashos/config.json
ash doctor                               Check tool health + provider connectivity
ash status                               Show provider/agents/tools summary
ash provider list                        List available providers
ash provider set <name>                  Set the active provider
ash plugin list                          List loaded plugins
ash plugin install <name>                Load a plugin from ./plugins/<name>
ash plan <goal...>                       Decompose a goal into a task graph (no execution)
ash run <goal...>                        Plan and execute a goal end to end
ash chat                                 Interactive chat session
ash memory list [--scope <scope>]        Inspect memory records
ash memory forget <scope> <key>          Delete a memory record
ash logs                                 Show recent log entries
ash evolve run [-m <n>] [-p <n>] [-b <ids>]   Run an evolution cycle (observe->mutate->benchmark->accept/reject)
ash evolve status                        Show Evolution Engine config + history summary
ash evolve list [-l <n>]                 List past experiments, newest first
ash evolve show <id>                     Show full detail for one experiment
ash evolve mutations                     List registered mutations
ash evolve benchmarks                    List registered benchmarks
ash evolve prune                         Remove worktrees/branches orphaned by an unclean shutdown (also runs automatically before `evolve run` and on API server startup)
ash innovation discover [-d <domains>]   Run one discovery cycle (collect signals -> merge into opportunities)
ash innovation list [-l <n>] [-s <stage>]  List opportunities, highest-scoring first
ash innovation show <id>                 Show full detail for one opportunity
ash innovation brief                     Generate today's Daily Innovation Brief
ash innovation profile [-l <n>]          Show the learned Builder Profile
ash innovation collectors                List registered collectors
```

Run `npm run cli -- <command>` during development, or `ash <command>`
once installed globally after `npm run build && npm link` (or via
`npm pack && npm install -g ./ashos-<version>.tgz` — see the README's
"Installing `ash` globally" section for both paths and why `package.json`
needs a `files`/`prepare` setup for the tarball path to actually contain a
working `dist/`).

`ash evolve exec --input <text>` also exists but is internal: the Evolution
Engine spawns it inside a mutated git worktree to exercise that workspace's
own `ashos.run()` pipeline during benchmarking — not meant for interactive
use. See `docs/evolution.md` for the full `ash evolve` design.
