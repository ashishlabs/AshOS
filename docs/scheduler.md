# Scheduler

`Scheduler` (`scheduler/scheduler.ts`, `AshOS.scheduler`) is a thin
`node-cron` wrapper for recurring jobs — it was real, working
infrastructure well before this doc existed, but the only way to use it
was writing SDK code directly (e.g. `AshOS.startScheduledJobs()`'s daily
reflection job). There was no `ash schedule` command and no `/scheduler`
route — anyone wanting a recurring job (a daily digest, a nightly
reflection over a custom goal) had to write a standalone script.

This closes that gap, plus a related one: `ash workflow run <file>`, a
CLI command to run a user-authored JSON workflow (`examples/workflows/`)
directly, without going through the REST API or SDK.

## Why persistence is the real problem

`Scheduler` itself is in-memory only — `this.tasks`/`this.jobs` are plain
`Map`s, reset to empty every time a process starts. `ash schedule add`
runs inside a short-lived CLI process that exits immediately after the
command returns, so registering the job directly on `this.scheduler`
would accomplish nothing: the `node-cron` timer would be destroyed the
instant the process exits, before it could ever fire.

So `ash schedule add`/`POST /scheduler` don't touch `Scheduler` at all —
they persist a `PersistedSchedule` to `.ashos/schedules.json` via
`ScheduleStore` (`scheduler/schedule-store.ts`, same single-JSON-file
read-modify-write pattern as `MemoryManager`/`KnowledgeGraph`). A
long-running process — today, only `api/server.ts`'s `require.main ===
module` block, via `startScheduledJobs()` — reads every persisted
schedule back with `AshOS.loadPersistedSchedules()` and registers each
one on the real `Scheduler`, with a `run()` callback that dispatches to
the schedule's `target`:

```
ash schedule add / POST /scheduler
        │  (persists only — no live timer yet)
        ▼
.ashos/schedules.json (ScheduleStore)
        │
        │  read back by a long-running process, once, at startup
        ▼
AshOS.loadPersistedSchedules()  →  Scheduler.schedule({ id, cron, run })
        │
        ▼
run() fires on the cron schedule  →  AshOS.run(goal)  or  AshOS.runWorkflowFile(file)
```

A schedule's `target` is one of:

- `{ kind: "goal", goal: string }` — plans and executes the goal exactly
  like `ash run <goal>` (`AshOS.run()`).
- `{ kind: "workflow", file: string }` — reads and runs a workflow JSON
  file exactly like `ash workflow run <file>` (`AshOS.runWorkflowFile()`).

No new execution path was built for either — both reuse the exact
entry points `ash run`/`ash workflow run` already use.

## Quick start

```bash
# Schedule a goal to run every morning at 9am
ash schedule add "0 9 * * *" --goal "summarize yesterday's activity" --description "morning digest"

# Schedule a workflow file to run every Friday at 6pm
ash schedule add "0 18 * * 5" --workflow ./examples/workflows/research-and-build.json

ash schedule list
ash schedule remove <id>

# Run a workflow file directly, once, right now
ash workflow run ./examples/workflows/research-and-build.json
```

Or the REST API:

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/scheduler` | `{ cron, description?, goal }` or `{ cron, description?, workflowFile }` | Persist a new schedule. `400` if `cron` is missing/invalid, or if neither/both of `goal`/`workflowFile` are given. |
| GET | `/scheduler` | — | List every persisted schedule. |
| DELETE | `/scheduler/:id` | — | Remove a persisted schedule and cancel it immediately if this process already had it registered. `404` if unknown. |

**A schedule you add only actually fires once the API server (`npm run
api` / `ash api`) is running** — `ash schedule add` from a one-off CLI
invocation persists the definition for the *next* time a long-running
process starts (or, if the server is already running, it won't pick up
a newly-added schedule until it restarts — `loadPersistedSchedules()`
only runs once, at `startScheduledJobs()` time). This is the same
constraint the pre-existing daily reflection job has always had, just
made explicit for user-created schedules too.

## CLI

- `ash schedule add <cron> (--goal <goal> | --workflow <file>) [--description <text>]`
- `ash schedule list`
- `ash schedule remove <id>`
- `ash workflow run <file>` — run a workflow JSON file directly, once.

## What's not implemented

- **No way to run a persisted schedule on demand** (`ash schedule run
  <id>`) — only `ash run`/`ash workflow run` for a one-off invocation, or
  waiting for the actual cron time. Small addition if needed.
- **No history of past firings** — a schedule fires and its result is
  whatever `AshOS.run()`/`runWorkflowFile()` already records (Outcome
  Memory, the Knowledge Graph), but there's no dedicated "this schedule
  last ran at X, succeeded/failed" record.
- **No pause/resume**, only add/remove.
