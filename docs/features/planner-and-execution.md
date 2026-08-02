# Feature: Planner & Goal Execution

**Status:** ✅ Complete

## 1. What is this feature?

This is the core "AI Employee" loop: you describe a goal in plain
English, and AshOS breaks it into a dependency graph of concrete tasks,
assigns each task to the right specialized agent, and runs them —
independent tasks in parallel, dependent tasks in order, with automatic
retries on failure. Since Stage 5, code-producing tasks are also verified
(tests run) before being reported done — see
[Verification Gate](./verification-gate.md).

**Business value:** this is what turns AshOS from "a chatbot" into "an
agent that gets things done" — you state an outcome, not a sequence of
steps, and get a report of what actually happened.

## 2. Who is this for?

- **Anyone who wants to delegate a multi-step task** ("research X, build
  it, test it") instead of manually running each agent themselves.
- **Anyone who wants to see the plan before committing to running it** —
  `ash plan` shows the task breakdown without executing anything.

## 3. How to use it

**See the plan without running it** (useful to sanity-check before
committing):
```bash
ash plan "add rate limiting to the API and write tests for it"
```

**Plan and execute in one step:**
```bash
ash run "add rate limiting to the API and write tests for it"
```

**Via REST API** (for integrating into another app/CI pipeline):
```bash
curl -X POST http://localhost:4700/plan -H "content-type: application/json" \
  -d '{"goal": "add rate limiting to the API"}'

curl -X POST http://localhost:4700/execute -H "content-type: application/json" \
  -d '{"goal": "add rate limiting to the API"}'
```

**Via the SDK** (embedding AshOS in your own Node app):
```ts
import { AshOS } from "ashos";
const ashos = new AshOS();
const { graph, results } = await ashos.run("add rate limiting to the API");
```

## 4. Example walkthrough

```bash
ash plan "research best practices for pagination, implement it, and test it"
```
Output shows 3 tasks: `research-pagination` → `implement-pagination` (depends
on research) → `test-pagination` (depends on implement). Satisfied with the
plan? Run it for real:
```bash
ash run "research best practices for pagination, implement it, and test it"
```
AshOS runs the research task, then the implementation (which also
triggers automatic test verification via the Verification Gate before
being marked done), then the explicit test task, reporting success/
failure per task.

## 5. Tips & limitations

- If your active provider (like the default `mock`) doesn't return valid
  JSON for the plan, AshOS falls back to a single `generic`-capability
  task rather than failing outright — planning never hard-fails, but you
  won't get real task decomposition without a real provider.
- Retries are per-task (`retries` option, default 1) — a task that keeps
  failing eventually reports `failed`, and any task depending on it is
  automatically skipped rather than run against broken input.
- The Planner itself doesn't use the [Model Router](./model-router.md) —
  only task *execution* does. Decomposing the goal always uses your
  active provider directly.
