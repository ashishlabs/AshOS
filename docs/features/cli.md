# Feature: CLI (`ash`)

**Status:** ✅ Complete (21 command groups; re-counted — includes `schedule` and `workflow`, added since this was last 11)

## 1. What is this feature?

The `ash` command-line tool is the fastest way to use everything AshOS
does, right from your terminal — no server to start, no code to write.

**Business value:** for day-to-day use (running a goal, checking status,
inspecting memory/logs, managing providers/plugins), the CLI is the
lowest-friction entry point — one command, immediate result.

## 2. Who is this for?

- **Individual developers** using AshOS directly in their terminal
  workflow.
- **Anyone scripting AshOS** into shell scripts, Makefiles, or CI steps
  where a REST call would be more ceremony than needed.

## 3. How to use it

**Get started:**
```bash
ash init                 # writes .ashos/config.json (defaults to the mock provider)
ash doctor                # checks tool health + provider connectivity
ash status                 # shows active provider/agents/tools
```

**Run the CLI from source during development** (before `npm link`):
```bash
npm run cli -- status
npm run cli -- run "add a health-check endpoint"
```

**Everyday commands:**
```bash
ash plan "<goal>"                       # see the task breakdown, don't run it
ash run "<goal>"                        # plan and execute end to end
ash chat                                 # interactive chat session
ash memory list [--scope s] [--tag t]    # inspect memory
ash logs                                 # recent activity log
ash provider list / set <name>           # switch AI backends
ash provider router status/enable/...    # Model Router config
ash plugin list / install <name>         # manage plugins
ash innovation discover/list/show/brief  # Innovation Intelligence
ash codebase index/find/list             # Local Codebase Intelligence
ash graph stats/nodes/neighbors          # Knowledge Graph
```

Full reference with every flag: `docs/cli.md`.

## 4. Example walkthrough

First-time setup through your first real task:
```bash
ash init --provider ollama
ash doctor                                   # confirm Ollama is reachable
ash plan "write a script that dedupes a CSV file"
ash run "write a script that dedupes a CSV file"
ash memory list --tag outcome                # see what happened, and whether it passed verification
```

## 5. Tips & limitations

- Once built (`npm run build && npm link`, or a packed tarball), `ash`
  is a global command — see the README's "Installing `ash` globally"
  section for the exact steps and why `package.json` needs a
  `files`/`prepare` setup for the tarball path to work.
- Two features have **no CLI surface yet** and are REST/SDK-only:
  [Workflow Engine](./workflow-engine.md) execution and the
  [Scheduler](./scheduler.md).
- `npm run dev:full` starts both the API and the dashboard together —
  useful if you want the visual [Dashboard](./dashboard.md) rather than
  the terminal.
