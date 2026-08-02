# Feature: Scheduler

**Status:** ✅ Complete (infrastructure); SDK-only today, no CLI/REST surface yet

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

- **Developers embedding AshOS in their own app/service** who want to
  wire up recurring jobs (a workflow, a planner goal, a custom callback)
  without building their own cron infrastructure.

## 3. How to use it

**This is currently SDK-only** — there's no `ash schedule ...` CLI
command or `/scheduler` REST route yet, so using it means writing a
small script (or wiring it into your own long-running service) against
the `AshOS` class directly:

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

- **No CLI or REST surface** — you must write code against the SDK
  today. This is the main practical gap if you want scheduling without
  writing a script.
- Jobs are plain in-memory registrations — they don't persist across a
  process restart. If your process restarts, you need to re-register
  jobs on startup.
- Minimum granularity is whatever `node-cron`'s standard cron syntax
  supports (down to per-minute), same as any Unix cron expression.
