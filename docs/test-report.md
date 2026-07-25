# AshOS Test Report

**Date:** 2026-07-25
**Scope:** Full repository — kernel, providers, tools, memory, agents, planner,
workflow, scheduler, SDK, REST API, CLI, dashboard.
**Branch:** `claude/ashos-ai-operating-system-9fugjd`

## Summary

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ clean (strict TS, no errors) |
| `npm test` | ✅ 78/78 tests passing across 16 files |
| `npm run test:coverage` | 70.4% statements / 76.8% branches / 75.1% functions overall |
| `npm run build` (backend) | ✅ compiles to `dist/` |
| `npm run dashboard:build` | ✅ Vite production build succeeds |
| Live end-to-end run | ✅ CLI, API, and dashboard driven for real (see below) — not just unit tests |
| `npm audit` | ⚠️ 12 vulnerabilities, all in transitive **dev** dependencies (see Findings) |

Going in, the suite was 48 tests / 13 files at ~67% coverage. This pass added
30 tests (CLI command tests, API validation/security tests, a `Kernel`
event→logger wiring test, and `ContextManager` tests that had none before),
fixed one real logic bug, fixed a class of silent-failure UX bugs in the
dashboard, and added input validation to five REST routes that previously
trusted the request body blindly.

## Methodology

1. **Unit/integration tests** (Vitest, `mock` provider, no network) — colocated
   `*.test.ts` next to source, covering happy paths, retries/rollback in the
   DAG executor, permission gating, memory scope isolation, and provider
   registry behavior.
2. **API-level tests** — a real Express server on an ephemeral port, hit with
   `fetch` (not mocked), including a deliberate attempt to run a dangerous
   shell command through a workflow to confirm the permission gate holds
   end-to-end, not just at the unit level.
3. **CLI tests** — each command's `register*Command` wired into a fresh
   `commander.Command` and invoked via `parseAsync` in an isolated temp
   directory, asserting on real stdout and real `.ashos/config.json` writes.
4. **Live exploratory testing** — actually started the API (`npm run api`)
   and dashboard (`npm run dashboard:dev`) and drove them with a headless
   Chromium (Playwright) through every tab: Dashboard, Providers, Agents,
   Tools, Plan, Workflow, Memory, Logs, Chat — including the API-down case
   for each tab, and the streaming chat path end to end.
5. **Dependency audit** — `npm audit`.

## Results by area

| Package | Tests | Stmt % | Notes |
|---|---|---|---|
| `kernel/` | 32 | 89.1% | DAG executor (parallelism, retries, rollback, skip-on-fail), event bus, permission manager, plugin loader, config, context manager, and the new event→logger mirroring all covered. |
| `providers/` | 4 | 24.1% | `mock` and the registry are covered; `anthropic`/`openai`/`ollama` are exercised by construction only, not `chat()`/`stream()` — see Findings. |
| `tools/` | 5 | 73.5% | Shell/git/fs tools, including the dangerous-command deny path. |
| `memory/` | 4 | 73.9% | Scope isolation, TTL expiry, tag/text query, persistence across manager instances. |
| `agents/` | 5 | 86.2% | All five agents exercised against the mock provider and real tool registry. |
| `planner/` + `workflow/` | 6 | 86.8% / 94% | JSON parsing + fallback, capability routing, dependency ordering, skip-on-failure. |
| `scheduler/` | 3 | 87.1% | Cron validation, scheduling, cancellation. |
| `sdk/` | 3 | 84.6% | Facade wiring (`chat`/`plan`/`run`/`runWorkflow`). |
| `api/` | 18 | 80.4% | All routes including the new validation and the workflow→permission-manager security test. |
| `cli/` | 9 | 64.2%* | `init`, `status`, `doctor`, `plan`, `run`, `provider`, `memory` covered; `chat`/`logs`/`plugin` are 0% (see Findings). |
| `dashboard/` | 0 (manual/e2e only) | n/a | No unit test runner configured for the Vite workspace; verified by driving the real UI instead (see below). |

\* `cli/index.ts` itself (the shebang entry point) is intentionally untestable as a unit — it just wires commands and calls `parseAsync(process.argv)`.

## Live end-to-end verification

Beyond unit tests, the running app was actually driven:

- **CLI**: `ash init`, `ash doctor`, `ash status`, `ash plan`, `ash run` invoked as real subprocesses against a real `.ashos/` directory.
- **API**: every route hit with real HTTP requests against a live server, including the streaming `/chat/stream` endpoint read as a real chunked response.
- **Dashboard**: headless Chromium navigated the SPA through the Vite dev proxy to the live API — Plan, Workflow, Memory, and Chat tabs were exercised with real form input and real button clicks, screenshotted at each step, and the browser console was checked for uncaught errors.
- **Security path**: a workflow step routed to the Testing agent with `command: "rm -rf /tmp/should-not-be-deleted"` was submitted through the live API; the `PermissionManager` correctly denied it end-to-end (agent → shell tool → permission check → deny → workflow step marked `failed` with a clear error), confirmed both via a Vitest assertion and by inspecting the mirrored log output.

## Bugs found and fixed this pass

1. **`ContextManager.detectProject()` returned `""` as the project name when no `package.json`/`.git` exists anywhere up to the filesystem root.** The directory-walk loop terminates at the filesystem root (`/`), and `path.basename("/")` is `""` on POSIX — so a project with no markers got silently mislabeled with an empty name instead of a sensible fallback. **Fixed**: when no marker is found, the detector now falls back to the original starting directory instead of the walked-to root. Caught by a new `kernel/context-manager.test.ts` (this file had zero tests before this pass).
2. **REST API routes trusted the request body with no validation.** `/chat`, `/chat/stream`, `/plan`, `/execute`, `/workflow`, and `/memory` (`POST`) would either degrade silently (e.g. a missing `goal` produced a task with no `description` field) or throw an unhandled-shape error caught only by the generic 500 handler. **Fixed**: added explicit 400 validation (`'messages' must be a non-empty array`, `'goal' must be a non-empty string`, workflow must have `name` + `steps`, memory writes must have a valid `scope` + non-empty `key`), with tests for every rejection path.
3. **Dashboard tabs silently swallowed fetch errors.** Providers, Agents, Tools, Memory, Logs, Plan, and Chat all used `.catch(() => {})` (or no catch at all) on their data loads, so if the API was unreachable the tab just rendered blank with no indication why — confirmed by killing the API and driving each tab with a headless browser. **Fixed**: every tab now surfaces a clear inline error (`Could not load from the AshOS API: <reason>. Is 'npm run api' running?`) via a shared `<LoadError>` component, verified by screenshotting each affected tab with the API down and back up.

## Known gaps (not fixed — recommended follow-ups)

- **Real provider implementations are untested.** `AnthropicProvider`, `OpenAIProvider`, and `OllamaProvider` have no assertions on `chat()`/`stream()`/`embeddings()` behavior — they'd need `fetch` mocking or recorded HTTP fixtures, which didn't exist before this pass either. This is a deliberate consequence of the "mock is the tested default" design, but it means a change to request/response parsing in a real provider could silently break without CI catching it.
- **`kernel/agent-router.ts` (`AgentRouter`) is dead code.** `Kernel` constructs one (`this.agentRouter`), but nothing ever calls `.register()` or `.route()` on it — all real capability routing goes through the separate `AgentRegistry.findByCapability()` in `agents/registry.ts`. The two classes are near-duplicates. Recommend either wiring `AgentRegistry` to use `AgentRouter` internally, or deleting the unused one — left as-is here since it's a design decision, not a bug, and the PRD captures it as a cleanup item.
- **`cli/commands/chat.ts`, `logs.ts`, `plugin.ts` are untested.** `chat.ts` is an interactive `readline` loop (hard to unit test meaningfully); `logs.ts` and `plugin.ts` are thin enough that a couple of quick tests would close the gap cheaply — not done here for time.
- **No dashboard unit tests.** The Vite workspace has no test runner wired up at all; coverage there is entirely from manual/e2e driving. A component-level test setup (Vitest + Testing Library) is a reasonable next step.
- **`npm audit`: 12 vulnerabilities, all transitive dev dependencies** — `esbuild`/`vite` (dev-server request forgery, moderate), `glob`/`brace-expansion` via `test-exclude`→`@vitest/coverage-v8` (DoS, high), and `uuid` via `node-cron` (buffer bounds check, moderate). None are in a production request path; `node-cron` is the only one with a runtime (not dev-only) dependency chain. `npm audit fix --force` resolves them but pulls in breaking major versions of `vitest`/`vite`/`node-cron` — not applied here to avoid destabilizing the suite without dedicated regression testing of that upgrade.
- **No load/performance testing.** Nothing here exercises `DagExecutor` under high task-graph fan-out, concurrent API load, or large memory-store sizes (the `VectorStore` is brute-force cosine similarity — fine for hundreds of records, not for thousands+).

## How to reproduce

```bash
npm install
npm run typecheck
npm test                 # 78 tests, ~2-3s
npm run test:coverage    # same, plus the table above
npm run build && npm run dashboard:build
npm audit
```
