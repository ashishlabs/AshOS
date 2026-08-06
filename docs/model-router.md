# Model Router

The Model Router is task-aware provider selection: send routine, low-stakes
work to a cheap or local model, and reserve the strongest configured
provider for tasks that actually need it. It's Stage 2 of the North Star
feature plan (`docs/roadmap-v2.md`), closing goal #6 (Local-First AI) —
the same "router" idea discussed against a third-party "compound agent
stack" video earlier in this project's design conversations.

## Off by default

`config.router.enabled` is `false` out of the box. When disabled,
`ModelRouter.select()` always returns `providers.active()` — the exact
provider AshOS already used for everything before the router existed.
Nothing about existing behavior changes unless a project explicitly turns
routing on, the same "offline/simple by default, advanced behavior via
explicit opt-in" convention every other AshOS subsystem follows.

## Quick start

```bash
ash provider router status              # show current config
ash provider router enable
ash provider router set simple ollama   # routine tasks -> local model
ash provider router set standard lmstudio
ash provider router set complex anthropic  # only escalate when it matters
```

Or the REST API: `GET`/`PATCH /providers/router`.

## How selection works

Three tiers, not a numeric score — coarse enough to configure once and
forget:

| Tier | Intended for |
|---|---|
| `simple` | Routine, low-stakes tasks — status checks, deterministic lookups, formatting. |
| `standard` | Everyday work that isn't trivial but doesn't need a frontier model. |
| `complex` | Tasks that genuinely need the strongest available model. |

`ModelRouter.select(complexity)` (`providers/router.ts`) resolves the
configured provider name for that tier via the existing
`ProviderRegistry`, falling back to `providers.active()` if the
configured name isn't actually registered — a misconfigured router should
never break a task that would otherwise have worked.

## Where the complexity comes from

Every agent already declares its own `capabilities` (e.g. `"generic"`,
`"code"`, `"testing"`). `defaultComplexityForCapability()` maps an agent's
primary capability to a sensible default tier —
`generic`/`testing`/`git`/`github-trending`/`codebase-analyst`/
`repository-analyst`/`technology-radar` default to `simple`;
`code`/`research` default to `standard`; the five specialist agents
(`review`/`security-audit`/`devops`/`ui-design`/`architecture`) are
unlisted, so they also get `standard` — the same "anything unlisted
defaults to `standard` rather than guessing cheap" rule. A specific task can override this
by setting `AgentTask.complexity` explicitly — that always wins over the
agent-level default.

## Integration point: one change, every agent gets it for free

`BaseAgent.execute()` (`agents/base-agent.ts`) is the single place every
concrete agent already funnels through for lifecycle-event boilerplate.
Routing was added there, not in each agent:

```ts
private resolveContext(task: AgentTask, context: AgentContext): AgentContext {
  if (!context.router) return context;
  const complexity = task.complexity ?? defaultComplexityForCapability(this.capabilities[0]);
  return { ...context, provider: context.router.select(complexity) };
}
```

Every existing agent (Code, Research, Git, Testing, Generic, GitHub
Trending, Codebase Analyst, and every Innovation agent) is automatically
routing-aware without a single line of its own `run()` changing. A
context without a `router` (e.g. `InnovationModule`'s own
`agentContext()`, which deliberately always uses the configured
`researchProvider`) is left untouched — routing is additive, never forced
onto a context that didn't ask for it.

## Configuration

```json
// .ashos/config.json
{
  "router": {
    "enabled": false,
    "simpleProvider": "ollama",
    "standardProvider": "lmstudio",
    "complexProvider": "anthropic"
  }
}
```

Provider names are whatever's registered in `ProviderRegistry` — including
ones a plugin adds via `registerFactory`, not just the five built-in
providers.

## REST API

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/providers/router` | — | Current `RouterConfig`. |
| PATCH | `/providers/router` | partial `RouterConfig` | Merges into and persists the router config. |

## CLI

`ash provider router status|enable|disable|set <simple\|standard\|complex> <provider>`.

## What's not implemented

- **No automatic complexity inference beyond the per-capability default.**
  A task either uses its agent's default tier or an explicit
  `AgentTask.complexity` override — there's no heuristic that inspects a
  task's description/goal text to guess how hard it is. Deliberately
  conservative: guessing wrong and silently downgrading a hard task to a
  weak model is worse than requiring an explicit override.
- **No cost/latency tracking or benchmark-driven tier assignment** (the
  "GoldieBench"-style leaderboard idea from the original design
  conversation) — provider-to-tier mapping is a manual config choice
  today, not something AshOS measures and recommends itself. A natural
  Stage 5+/self-improvement extension once outcome data exists to learn
  from (see `docs/roadmap-v2.md` Stage 3, Outcome Memory).
- **The Planner itself doesn't route** — `Planner.plan()` always uses
  `providers.active()` directly, not the router. Routing applies to agent
  *execution* (via `TaskExecutor`/`WorkflowEngine`/`runAgent`), not to the
  goal-to-task-graph decomposition step.
