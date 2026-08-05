# CLI Reference

```
ash init [--provider <name>] [--force]   Initialize .ashos/config.json
ash doctor                               Check tool health + provider connectivity
ash status                               Show provider/agents/tools summary
ash provider list                        List available providers
ash provider set <name>                  Set the active provider
ash provider router status               Show task-aware provider routing config (off by default)
ash provider router enable|disable       Turn routing on/off
ash provider router set <tier> <name>    Set which provider handles simple|standard|complex tasks
ash plugin list                          List loaded plugins
ash plugin install <name>                Load a plugin from ./plugins/<name>
ash plan <goal...>                       Decompose a goal into a task graph (no execution)
ash run <goal...>                        Plan and execute a goal end to end
ash chat                                 Interactive chat session
ash memory list [--scope <scope>] [--tag <tag>]  Inspect memory records (e.g. --tag outcome for auto-recorded task history)
ash memory forget <scope> <key>          Delete a memory record
ash logs                                 Show recent log entries
ash innovation discover [-d <domains>] [--live]   Run one discovery cycle (--live uses every real collector: GitHub/HN/Reddit/arXiv/Hugging Face)
ash innovation digest [-s <sources>]     Run live collectors and save today's AI news as a Markdown file (.ashos/innovation/digests/)
ash innovation list [-l <n>] [-s <stage>]  List opportunities, highest-scoring first
ash innovation show <id>                 Show full detail for one opportunity
ash innovation brief                     Generate today's Daily Innovation Brief
ash innovation profile [-l <n>]          Show the learned Builder Profile
ash innovation collectors                List registered collectors (+ the opt-in live GitHub one)
ash innovation events [-l <n>] [-c <category>]   List canonical, deduplicated events
ash innovation repo analyze <owner/repo> Analyze a repository into a structured, cached profile (real API)
ash innovation repo list [-l <n>]        List every previously analyzed repository
ash innovation radar [-r]                Show the Technology Radar (-r/--refresh recomputes it first)
ash innovation idea capture [content] [-i <inboxId>] [-t <tags>] [-d <domain>]
                                          Score/dedupe an idea (or an existing Inbox item) into an Opportunity
ash codebase index [path] [-f]           Index a local repository (defaults to cwd), cached by git commit hash
ash codebase find <query> [-p <path>]    Search a previously indexed repository by symbol or file path
ash codebase list                        List every repository indexed so far
ash graph stats                          Show general Knowledge Graph node/edge counts, grouped by kind
ash graph nodes [-k <kind>]              List nodes, optionally filtered by kind (project|agent|task|...)
ash graph neighbors <id>                 Show every node directly connected to the given node id
ash inbox add <content...> [-t <tags>]   Capture and auto-classify text/a URL into the Universal Inbox
ash inbox list [-s <status>]             List inbox items, newest first
ash inbox show <id>                      Show full detail for one inbox item
ash inbox archive <id>                   Mark an inbox item archived
ash reflect [period] [--save] [--cached]  Daily (default)/weekly/monthly review narrative from Outcome Memory + Inbox + Knowledge Graph activity.
                                          --save persists it to .ashos/reflections/ so a later --cached call reads it back without another LLM call.
ash search <query> [-l <n>] [-s]         Hybrid search across Memory, the Knowledge Graph, and the Inbox (-s/--semantic for embedding-based Memory search)
```

Run `npm run cli -- <command>` during development, or `ash <command>`
once installed globally after `npm run build && npm link` (or via
`npm pack && npm install -g ./ashos-<version>.tgz` — see the README's
"Installing `ash` globally" section for both paths and why `package.json`
needs a `files`/`prepare` setup for the tarball path to actually contain a
working `dist/`).
