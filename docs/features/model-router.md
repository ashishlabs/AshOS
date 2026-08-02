# Feature: Model Router

**Status:** ✅ Complete (off by default)

## 1. What is this feature?

The Model Router automatically picks *which* AI provider handles a given
task based on how hard the task is — routine work goes to a cheap/local
model, harder work escalates to a stronger (usually paid, cloud) model.
Instead of manually switching providers depending on the task, you
configure the mapping once and every agent benefits automatically.

**Business value:** this is the lever that keeps AI-agent costs
predictable. Without it, every task — including trivial ones like
"check status" — runs on whatever your single active provider is, which
means you're either overpaying for routine work on a frontier model, or
under-powering hard work on a cheap one.

## 2. Who is this for?

- **Anyone running AshOS against paid cloud APIs** who wants to cut
  token spend without manually babysitting which provider handles what.
- **Teams with both a local model and a cloud subscription** who want
  the local model to absorb as much work as possible.

## 3. How to use it

Routing is **off by default** — nothing changes until you turn it on.

**Check current config:**
```bash
ash provider router status
```

**Turn it on and assign a provider per difficulty tier:**
```bash
ash provider router enable
ash provider router set simple ollama       # routine, low-stakes tasks
ash provider router set standard lmstudio   # everyday work
ash provider router set complex anthropic   # only escalate when it matters
```

**Turn it back off:**
```bash
ash provider router disable
```

**Via REST API:**
```bash
curl http://localhost:4700/providers/router
curl -X PATCH http://localhost:4700/providers/router \
  -H "content-type: application/json" \
  -d '{"enabled": true, "simpleProvider": "ollama"}'
```

You don't need to do anything else — once enabled, every existing agent
(Code, Research, Git, Testing, Generic, and all Innovation agents) is
automatically routing-aware. Each agent's primary capability already maps
to a sensible default tier (e.g. `code`/`research` → `standard`,
`generic`/`testing`/`git` → `simple`).

## 4. Example walkthrough

You have a free local Ollama model and an Anthropic subscription. You
want simple status/formatting tasks to never touch your paid quota:

1. `ash provider router set simple ollama`
2. `ash provider router set standard lmstudio` (a slightly stronger local model)
3. `ash provider router set complex anthropic`
4. `ash provider router enable`
5. Run `ash run "implement a new CLI subcommand"` — this routes to
   `standard` (the `code` capability's default tier) and uses LM Studio,
   not your Anthropic key, unless you explicitly mark the task complex.

## 5. Tips & limitations

- There's no automatic difficulty *detection* — a task either uses its
  agent's default tier, or you override it explicitly via
  `AgentTask.complexity` in your own SDK code. AshOS won't guess and
  silently downgrade something hard to a weak model.
- If a configured provider name isn't actually registered, the router
  falls back to your normal active provider rather than failing the task.
- The Planner itself (goal → task graph) always uses your active
  provider directly — routing applies to *executing* tasks, not to the
  initial decomposition step.
- Full technical detail: `docs/model-router.md`.
