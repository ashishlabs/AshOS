# Feature: Outcome Memory

**Status:** ✅ Complete

## 1. What is this feature?

Every time any agent attempts a task, AshOS automatically writes down
what happened — which agent, what capability, what it was asked to do,
whether it succeeded or failed, the error if it failed, and how long it
took. You don't opt into this; it happens on every single task, with zero
setup.

**Business value:** this is AshOS's audit trail and its raw material for
learning from mistakes. Instead of "did that goal work?" being answered
only by watching the terminal in real time, you get a permanent,
queryable history — useful for debugging why a run failed last Tuesday,
or for spotting that one agent fails on a particular kind of task
repeatedly.

## 2. Who is this for?

- **Anyone debugging a failed or unexpected run** — instead of
  re-running and hoping to catch the error again, check what was
  recorded.
- **Anyone tracking AshOS's reliability over time** — filter by agent
  name or `failure` tag to see patterns.

## 3. How to use it

**See every recorded outcome:**
```bash
ash memory list --tag outcome
```

**Just the failures:**
```bash
ash memory list --tag failure
```

**Just one agent's history:**
```bash
ash memory list --tag code       # every outcome from the Code agent
```

**Via REST API:**
```bash
curl "http://localhost:4700/memory?tag=outcome&scope=project"
```

Each record looks like:
```json
{
  "agent": "code",
  "capability": "code",
  "description": "implement rate limiting",
  "outcome": "success",
  "durationMs": 842,
  "at": "2026-08-02T14:00:00.000Z"
}
```

## 4. Example walkthrough

A goal you ran yesterday seemed to partially fail, but you didn't
capture the terminal output. Recover what happened:

1. `ash memory list --tag failure`
2. Find the record whose `description`/`at` timestamp matches — it
   includes the actual `error` message the agent returned.
3. Cross-reference with `ash graph neighbors <task-id>` (see
   [Knowledge Graph](./knowledge-graph.md)) to see which project and
   agent it was tied to.

## 5. Tips & limitations

- This is passive logging only — nothing currently *reads* this history
  back to change future behavior (no automatic "avoid what failed
  before" loop yet). That kind of learning loop is future work, noted
  in `docs/roadmap-v2.md` under Continuous Learning.
- Records are written to `project` memory scope, so they're per-project,
  not global.
- Full technical detail: `docs/outcome-memory.md`.
