# Outcome Memory

Outcome Memory is the "AshOS should remember like a developer" half of
persistent memory (North Star goal #3): every agent task attempt — what
was tried, what happened — is written to project memory automatically,
without any agent or caller asking for it. It's Stage 3 of the North Star
feature plan (`docs/roadmap-v2.md`), and the raw material a future
pattern-extraction pass (goal #10, Continuous Learning) would read.

## Nothing to turn on

Unlike the Model Router (`docs/model-router.md`), Outcome Memory has no
enable/disable flag. Writing a record never changes what an agent does or
returns — there's no behavior to gate. It activates whenever
`AgentContext.memory` is present, which the main `AshOS` facade always
provides. The one place it's deliberately absent is
`InnovationModule`'s own internal `agentContext()` (used only by its
high-frequency discovery-cycle sweep) — that subsystem already has its
own persistence (events, opportunities, graph), so duplicating every
sweep into generic outcome memory would just be noise. Calling any
registered agent directly via `ashos.runAgent(...)` — including
Innovation's own `repository-analyst`/`technology-radar` — still records
an outcome, since that goes through the main facade's context.

## What gets recorded

```ts
interface TaskOutcome {
  agent: string;
  capability: string;
  taskId: string;
  description: string;
  outcome: "success" | "failure";
  output?: string;
  error?: string;
  durationMs: number;
  at: string;
}
```

One record per attempt (`agents/outcome.ts`'s `buildOutcome()`), saved to
`project` memory scope (`.ashos/memory/project.json`) under a key that
includes the agent name, task id, timestamp, and a random suffix — a
timestamp alone isn't unique enough for retries that land in the same
millisecond, so every attempt gets its own record rather than overwriting
the last one for the same task id.

## Where it happens

`BaseAgent.execute()` (`agents/base-agent.ts`) — the same seam the Model
Router uses — records the outcome after `run()` resolves (or throws),
tagged `["outcome", <agent name>, "success"|"failure"]`:

```ts
private async recordOutcome(task, context, result, durationMs): Promise<void> {
  if (!context.memory) return;
  const outcome = buildOutcome({ agent: this.name, capability: this.capabilities[0] ?? "unknown", task, result, durationMs });
  try {
    await context.memory.remember("project", outcomeMemoryKey(this.name, task.id, outcome.at), outcome, {
      tags: ["outcome", this.name, outcome.outcome]
    });
  } catch {
    // best-effort — never let outcome logging fail the task it's describing
  }
}
```

Every existing agent gets this for free, the same way every agent became
routing-aware in Stage 2 without its own `run()` changing. A memory-write
failure is swallowed — it never turns a successful task into a reported
failure.

## Querying

```bash
ash memory list --tag outcome            # every recorded attempt
ash memory list --tag failure            # only failures, across all agents
ash memory list --tag <agent-name>       # only one agent's history, e.g. "code"
```

Or `GET /memory?tag=outcome` (the existing `/memory` route already
supported `tag` filtering — Outcome Memory just gives it something worth
filtering for). `MemoryManager.searchSemantic()` also works over outcome
records if the active provider computes embeddings, since `remember()`
embeds every value it's given.

## What's not implemented

- **No automatic pattern extraction.** Outcome records are the raw
  material, not an analysis of it — nothing yet asks "what tends to fail"
  or feeds a summary back into planning prompts. That's the natural Stage
  4+/goal #10 extension once enough history has accumulated.
- **No retention or pruning policy.** Every attempt is a permanent record
  in `.ashos/memory/project.json`, which is read/written in full on every
  write (same JSON-file-per-scope pattern the rest of `MemoryManager`
  uses). For a single-user/small-team project this is expected to stay
  manageable, matching the scale assumptions documented in
  `docs/ashos-intelligence.md` §8 — but a long-running, high-task-volume
  project will eventually want a retention window or periodic archival,
  which isn't built yet.
- **No opt-out.** Given writing a record has no behavioral effect (unlike
  routing), there's currently no config flag to disable it — a context
  that truly shouldn't be recorded (like Innovation's internal sweep)
  simply doesn't pass `memory` into `AgentContext`. If a real need for a
  project-wide opt-out emerges, the natural place is a `config` check
  inside `recordOutcome()` itself.
