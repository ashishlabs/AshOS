# Feature: Dashboard

**Status:** 🟡 In Progress (~90% — functional, no automated tests yet)

## 1. What is this feature?

A visual, browser-based way to use AshOS — no terminal required. It's a
React + Tailwind app with 8 tabs that all talk to the REST API: Status,
Plan, Workflow, Innovation, Trending, Memory, Logs, and Chat.

**Business value:** not everyone wants to live in a terminal. The
dashboard gives a non-technical (or just terminal-averse) user the same
capabilities — running goals, browsing discovered opportunities,
searching memory, reading logs — through a normal web UI.

## 2. Who is this for?

- **Users who prefer a visual interface** over the CLI.
- **Anyone monitoring AshOS's activity at a glance** — the Logs and
  Status tabs surface live system activity without watching a terminal.
- **Anyone reviewing Innovation Intelligence output** — the Innovation
  and Trending tabs are much easier to browse visually than via `curl`.

## 3. How to use it

**Start both the API and the dashboard together:**
```bash
npm run dev:full
```
Then open `http://localhost:5173` (Vite proxies `/api` to the API server
on `:4700` automatically).

**Or run them separately:**
```bash
npm run api              # terminal 1
npm run dashboard:dev    # terminal 2
```

**Build a production bundle:**
```bash
npm run dashboard:build
```

**The 8 tabs:**

| Tab | What you can do there |
|---|---|
| Status (default) | See active provider, agents, tools at a glance. |
| Plan | Type a goal, see the task graph before running it. |
| Workflow | Run a JSON workflow definition and see per-step results. |
| Innovation | Browse discovered opportunities, generate a Daily Brief, view Technology Radar + Repository Intelligence. |
| Trending | See live GitHub trending repos on demand. |
| Memory | Search/browse memory records by scope/tag. |
| Logs | Live activity feed — every system event mirrored as a log entry. |
| Chat | Interactive chat with the active provider, right in the browser. |

## 4. Example walkthrough

You want to check on an overnight Innovation Intelligence discovery run
without touching the terminal:

1. `npm run dev:full`
2. Open the dashboard, go to the **Innovation** tab.
3. See ranked opportunities, click one for full detail (score, evidence
   signals).
4. Switch to **Logs** to confirm the discovery cycle actually ran
   overnight (if you scheduled it — see [Scheduler](./scheduler.md)).

## 5. Tips & limitations

- **Zero automated tests** — every dashboard change is verified manually
  (Playwright screenshots) rather than a repeatable test suite. This is
  the single biggest test-coverage gap in the project (see
  `PROJECT_STATUS.md`).
- Providers/Agents/Tools don't have their own dedicated tabs — they're
  still fully reachable via the Status tab and the underlying REST
  routes, just not broken out visually.
- The dashboard talks *only* to the REST API (`dashboard/src/api.ts`) —
  it never imports AshOS internals directly, so it can only do what
  `docs/api.md`'s routes expose.
