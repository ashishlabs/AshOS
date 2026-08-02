# Feature: Verification Gate

**Status:** ✅ Complete

## 1. What is this feature?

Whenever AshOS writes code for you as part of a goal, this feature makes
sure it's actually checked (tests run) before being reported as "done" —
rather than trusting the coding agent's own self-report. If verification
fails, the task is retried and, if it keeps failing, reported as failed
with a message telling you specifically that *verification* failed, not
that the coding step itself errored.

**Business value:** this is the difference between "AshOS said it's
done" and "AshOS actually checked it works." Without this, a
code-producing task could silently report success even if the resulting
code doesn't pass its own test suite.

## 2. Who is this for?

- **Anyone running goals that produce code** (`ash run "implement ..."`)
  who wants a built-in safety check, not just trust-the-model output.
- **Anyone building a CI-adjacent pipeline on AshOS** where "reported
  success" needs to actually mean tested-and-passing.

## 3. How to use it

**It's on by default — you don't need to do anything.** Any task the
Planner routes to the `code` capability automatically gets verified
(via `npm test`, run by the Testing agent) immediately after the code is
written, before the task is allowed to report success.

```bash
ash run "implement input validation for the signup form"
```
If the implementation breaks an existing test, the task fails with an
error like:
```
verification failed for "implement input validation": <test output>
```
instead of silently reporting success.

**Turn it off** (e.g. in a throwaway workflow with no real test suite) —
this is an SDK/programmatic option, not currently exposed via CLI flag:
```ts
new TaskExecutor({ agents, agentContext, verify: false });
```

**See verification events** in the activity log:
```bash
ash logs
```
Look for `task:verified` (passed) or `task:verification-failed` events.

## 4. Example walkthrough

```bash
ash run "add a new validation function and use it in the signup handler"
```
1. The Code agent writes the function.
2. Immediately after, the Verification Gate runs `npm test` via the
   Testing agent automatically — you didn't ask for this explicitly.
3. If tests pass: the task reports success, and you see a
   `task:verified` event in `ash logs`.
4. If tests fail: the task retries once, then reports `failed` with a
   verification-specific error — telling you the code was produced but
   didn't hold up, not that the agent itself crashed.

## 5. Tips & limitations

- Verification runs the **whole project's test suite** (or a configured
  command) — there's no "just verify the one file this task touched"
  granularity yet.
- Only code-producing tasks (`code` capability) are verified — research,
  git, and other task types have no equivalent quality gate today.
- If no verify-capable agent is registered in your setup, this silently
  no-ops rather than blocking your task — it's additive, never a hard
  requirement.
- Full technical detail: `docs/verification-gate.md`.
