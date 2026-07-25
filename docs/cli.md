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
```

Run `npm run cli -- <command>` during development, or `ash <command>`
once installed globally after `npm run build && npm link`.
