# Feature: Scheduler

**Status:** ✅ Complete — CLI (`ash schedule`), REST (`/scheduler`), and SDK surfaces all real

## 1. What is this feature?

The Scheduler runs a piece of code on a cron schedule — "every morning
at 7am, run this," "every hour, check for updates." It's what turns
AshOS from something you manually invoke into something that works in
the background on its own timeline. The daily AI news digest
([Live Collectors](./live-collectors.md)) is a concrete example of the
kind of job this is built to drive.

**Business value:** true automation means not having to remember to run
something — a recurring research sweep, a nightly report, a periodic
health check should just happen.

## 2. Who is this for?

- **Anyone running `ash api`** who wants a recurring goal or workflow
  without writing any code — `ash schedule add` from the terminal is
  enough.
- **Developers embedding AshOS in their own app/service** who want to
  wire up recurring jobs (a workflow, a planner goal, a custom callback)
  without building their own cron infrastructure.

## 3. How to use it

**From the CLI** (no code required):
```bash
ash schedule add "0 7 * * *" --goal "summarize what happened in the project overnight" --description "morning digest"
ash schedule add "0 6 * * *" --workflow ./examples/workflows/research-and-build.json
ash schedule list
ash schedule remove <id>
```

**Via REST:**
```bash
curl -X POST http://localhost:4700/scheduler -H "content-type: application/json" \
  -d '{"cron": "0 7 * * *", "goal": "summarize what happened overnight"}'
curl http://localhost:4700/scheduler
curl -X DELETE http://localhost:4700/scheduler/<id>
```

**A schedule added this way only actually fires once `ash api` (a
long-running process) is running** — see "Tips & limitations" below for
why, and `docs/scheduler.md` for the full persistence design.

**Directly against the SDK** (still available, e.g. for a custom
callback the CLI/REST surface doesn't support):
```ts
import { AshOS } from "ashos";

const ashos = new AshOS();

ashos.scheduler.schedule({
  id: "daily-digest",
  cron: "0 7 * * *",  // every day at 7am
  run: async () => {
    await ashos.run("summarize what happened in the project overnight");
  }
});
```

**Cancel a job:**
```ts
ashos.scheduler.cancel("daily-digest");
```

**List active jobs:**
```ts
ashos.scheduler.list();
```

Every fire also emits a `scheduler:job-fired` event on the shared
`EventBus`, so it shows up in `ash logs`/`GET /logs` like any other
system activity.

## 4. Example walkthrough

You're building a small always-on service that wraps AshOS and want a
nightly Innovation Intelligence digest:

```ts
import { AshOS } from "ashos";
const ashos = new AshOS();

ashos.scheduler.schedule({
  id: "nightly-ai-news",
  cron: "0 6 * * *",
  run: async () => {
    await ashos.innovation.runLiveDiscovery(); // real collectors, see Live Collectors
  }
});
```
Your process needs to stay running (e.g. as a long-lived Node process or
inside the API server process) for `node-cron` to actually fire the job.

## 5. Tips & limitations

- **`ash schedule add`/`POST /scheduler` only persist a definition** to
  `.ashos/schedules.json` (`ScheduleStore`) — `Scheduler` itself is
  in-memory only, so a job "added" from that short-lived CLI/request
  process couldn't actually fire from there even if it tried. A
  long-running process reads every persisted schedule back on startup
  (`AshOS.loadPersistedSchedules()`, called from `startScheduledJobs()`)
  and registers it for real. This means: **the schedule only starts
  firing once `ash api` is (re)started** — adding one to an already
  running server doesn't take effect until its next restart.
- A schedule's target is either a goal (`AshOS.run()`) or a workflow file
  (`AshOS.runWorkflowFile()`) — for anything else (a custom callback),
  register directly against `ashos.scheduler` in your own long-running
  process, as shown above.
- Minimum granularity is whatever `node-cron`'s standard cron syntax
  supports (down to per-minute), same as any Unix cron expression.
- No pause/resume, no run-on-demand, and no history of past firings yet
  — see `docs/scheduler.md`'s "What's not implemented" section.
