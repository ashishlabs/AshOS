# Verification Gate

The Verification Gate makes "the code agent returned `ok: true`" and "the
task is actually done" two different things. It's Stage 5 of the North
Star feature plan (`docs/roadmap-v2.md`), closing goal #1's "verify
results" half of Become an AI Employee.

## The problem

Before this stage, `TaskExecutor` treated a task as finished the moment
its assigned agent returned `{ ok: true }`. For a `"code"`-capability
task, that means "the model produced something and the code agent didn't
error" — not "the change actually builds or passes tests." A
`"verify"`-capability agent (`TestingAgent`) already existed, but nothing
forced it to run; an LLM-generated plan could route to it, or could just
as easily not.

## How it works

`TaskExecutor.execute()` (`planner/executor.ts`) already runs every
task's agent inside a `DagNode.run()` closure so `DagExecutor` can retry
on throw. The gate adds one more step to that same closure, after the
primary agent succeeds:

```ts
const result = await agent.execute({ id: task.id, description: task.description }, this.opts.agentContext);
if (!result.ok) throw new Error(result.error ?? `agent "${agent.name}" failed`);

if ((this.opts.verify ?? true) && CODE_PRODUCING_CAPABILITIES.includes(task.capability)) {
  await this.verify(task.id, task.title);
}

return result.output ?? "";
```

`verify()` looks up the registered `"verify"`-capability agent
(`VERIFICATION_CAPABILITY`) via the same `AgentRegistry` every other task
uses, runs it, and throws if it reports failure:

```ts
private async verify(taskId: string, title: string): Promise<void> {
  const verifier = this.opts.agents.findByCapability(VERIFICATION_CAPABILITY);
  if (!verifier) return;
  const verification = await verifier.execute(
    { id: `${taskId}-verify`, description: `Verify: ${title}` },
    this.opts.agentContext
  );
  this.opts.eventBus?.emit(verification.ok ? "task:verified" : "task:verification-failed", { id: taskId });
  if (!verification.ok) {
    throw new Error(`verification failed for "${title}": ${verification.error ?? "unknown reason"}`);
  }
}
```

Because the throw happens inside the same `DagNode.run()` closure as the
original agent call, `DagExecutor` can't tell the difference between "the
code agent failed" and "the code agent succeeded but verification
failed" — both are just the node's attempt throwing, so the **existing**
retry-up-to-`retries`, then-report-`failed`, skip-downstream-dependents
behavior applies with zero changes to `kernel/dag.ts`. The task's
reported error distinguishes the two cases: `agent "<name>" failed` vs.
`verification failed for "<title>": <reason>`.

## What counts as "code-producing"

`CODE_PRODUCING_CAPABILITIES` (currently `["code"]`) is an exported,
extensible list — a plugin or future agent capability can be added to it
without touching the gate logic itself. Every other capability
(`"generic"`, `"research"`, `"git"`, `"test"`, `"verify"` itself,
`"codebase-analyst"`, every Innovation capability, ...) is unaffected —
verification only ever runs after a code-producing task.

## Default agent: TestingAgent

`TestingAgent` (`agents/testing-agent.ts`) is registered by default under
both `"test"` and `"verify"` in `sdk/ashos.ts`'s `AgentRegistry`, so the
gate has a real verifier out of the box: it runs `npm test` (or
`task.input.command`, if set) via the shell tool and reports the result.
This means a real `ash run`/`ashos.run()` invocation whose planned task
graph includes a `"code"`-capability task will, by default, shell out to
`npm test` in `context.cwd` immediately after that task succeeds.

## Off switches and safe defaults

- **`TaskExecutorOptions.verify`** (defaults `true`) — set `false` to
  disable the gate entirely, e.g. in a test harness or a workflow that
  intentionally has no verify-capable agent.
- **No verifier registered → no-op, not a failure.** `verify()` returns
  immediately if `findByCapability("verify")` finds nothing, so a project
  without `TestingAgent` (or any custom `"verify"`-capability agent)
  registered behaves exactly as it did before this stage — a
  misconfigured or absent verifier never breaks a task that would
  otherwise have succeeded, the same "never break existing behavior"
  convention as `ModelRouter.select()`'s fallback.
- **Doesn't apply to the Planner's own mock-provider fallback.**
  `Planner.plan()` falls back to a single `"generic"`-capability task
  whenever the active provider's response isn't parseable JSON — which is
  always true for `MockProvider`'s deterministic echo response. This is
  why the entire existing test suite (which defaults to `MockProvider`
  everywhere) never triggers the gate: no test's planned graph lands on
  `"code"` unless a scripted provider is explicitly set up to return
  JSON naming it.

## Events

Two new `EventBus` events (`kernel/event-bus.ts`), mirrored into the
logger like every other bus event:

| Event | Payload | When |
|---|---|---|
| `task:verified` | `{ id }` | The verify-capability agent reported success. |
| `task:verification-failed` | `{ id }` | The verify-capability agent reported failure — the task itself then also emits the existing `task:failed` (after retries are exhausted) or is retried, per normal DAG behavior. |

## Tests

`planner/executor.test.ts` covers the gate directly with stub agents
(not real `CodeAgent`/`TestingAgent`, so tests never actually shell out):
verification runs and passes, verification runs and fails (task fails
with the verification error), non-code capabilities skip verification
entirely, a missing verifier no-ops instead of failing, and
`verify: false` disables the gate.

## What's not implemented

- **No `ReviewerAgent`.** The gate calls whatever's registered under
  `"verify"` — today that's always `TestingAgent`. A separate
  code-review-focused agent (Tier 2 of `docs/roadmap-v2.md`) could
  register the same capability, or the executor could be extended to run
  multiple verify-capable agents instead of just the first match.
- **No verification for non-code capabilities.** `"research"`, `"git"`,
  and other task types have no equivalent quality gate — only
  code-producing work is verified today.
- **No partial-verification granularity.** `TestingAgent` runs the whole
  project's test suite (or one configured command) — the gate has no
  concept of "just verify the file this task touched."
