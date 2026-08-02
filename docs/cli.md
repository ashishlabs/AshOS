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
ash innovation discover [-d <domains>] [--live]   Run one discovery cycle (--live uses the real GitHub Search API)
ash innovation list [-l <n>] [-s <stage>]  List opportunities, highest-scoring first
ash innovation show <id>                 Show full detail for one opportunity
ash innovation brief                     Generate today's Daily Innovation Brief
ash innovation profile [-l <n>]          Show the learned Builder Profile
ash innovation collectors                List registered collectors (+ the opt-in live GitHub one)
ash innovation events [-l <n>] [-c <category>]   List canonical, deduplicated events
ash innovation repo analyze <owner/repo> Analyze a repository into a structured, cached profile (real API)
ash innovation repo list [-l <n>]        List every previously analyzed repository
ash innovation radar [-r]                Show the Technology Radar (-r/--refresh recomputes it first)
```

Run `npm run cli -- <command>` during development, or `ash <command>`
once installed globally after `npm run build && npm link` (or via
`npm pack && npm install -g ./ashos-<version>.tgz` — see the README's
"Installing `ash` globally" section for both paths and why `package.json`
needs a `files`/`prepare` setup for the tarball path to actually contain a
working `dist/`).
