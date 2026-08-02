# Feature: Agents

**Status:** ✅ Complete (15 agents registered)

## 1. What is this feature?

Agents are AshOS's specialized workers. Instead of one generic
"AI does everything" loop, each agent declares what it's good at
(`capabilities`, e.g. `"code"`, `"research"`, `"git"`, `"test"`) and the
system routes each task to whichever agent's capability matches, the same
way you'd assign a ticket to the right team member instead of whoever's
free.

**Business value:** specialization means more predictable, higher-quality
output per task type, and it's the seam that lets AshOS grow new
capabilities (a Reviewer, a Security Auditor, ...) without rewriting
anything else — a new agent just registers a new capability.

## 2. Who is this for?

- **Anyone running multi-step goals** via `ash run`/`ash plan` — you
  don't pick an agent yourself, the Planner + `AgentRegistry` do it for
  you based on each task's declared capability.
- **Developers extending AshOS** who want to add a new specialist
  (a `BaseAgent` subclass is the entire contract).

## 3. How to use it

**See what's registered:**
```bash
ash status                       # lists agent names
curl http://localhost:4700/agents # names + capabilities + descriptions
```

**Today's roster:**

| Agent | Capability | What it does |
|---|---|---|
| Generic | `generic` | Fallback for anything that doesn't map to a specialist. |
| Code | `code`, `implement` | Writes/edits code, optionally to a target file. |
| Research | `research`, `summarize` | Reasons/summarizes using the active provider. |
| Git | `git`, `vcs` | Version-control operations via the Git tool. |
| Testing | `test`, `verify` | Runs the project's test suite (also the Verification Gate's default verifier). |
| GitHub Trending | `github-trending`, `trending-repos` | Live GitHub Search API query for trending repos. |
| Codebase Analyst | `codebase-analyst`, `codebase-intelligence` | Answers "where does X live" in your local repo. |
| Repository Analyst | `repository-analyst`, `repository-intelligence` | Analyzes an *external* GitHub repo. |
| Technology Radar | `technology-radar` | Classifies technologies as emerging/growing/stable/declining/obsolete. |
| 6 Innovation domain agents | `intelligence:<domain>` | Discover market/GitHub/community/research/workflow/competitor signals (internal to Innovation Intelligence). |

**Run one agent directly**, bypassing the planner, for deterministic
capabilities that don't need an LLM to decide how to invoke them:
```bash
curl "http://localhost:4700/agents/github-trending?limit=10"
```

**Let the Planner route for you** (the normal path):
```bash
ash run "add input validation to the signup form"
```
This decomposes the goal into tasks, and each task's `capability` field
picks the agent automatically.

## 4. Example walkthrough

You run `ash run "research best practices for rate limiting, then
implement one and test it"`. Behind the scenes:

1. Planner produces 3 tasks: research → implement → test.
2. Task 1 routes to the **Research** agent (`research` capability).
3. Task 2 routes to the **Code** agent (`code` capability) — its output
   also triggers the **Verification Gate**, which runs the Testing
   agent automatically.
4. Task 3 (if the plan includes an explicit test step) also routes to
   **Testing**.

You never picked an agent by name — capability matching did it.

## 5. Tips & limitations

- Routing is first-match by capability, not a bidding/negotiation
  system — if two agents shared a capability, the first registered wins.
- Six named specialist roles from the North Star vision don't exist yet:
  Reviewer, Security Auditor, DevOps Engineer, UI Designer, Architect,
  Video Creator — see [Multi-Agent Specialist Roles](./multi-agent-specialist-roles.md).
- Every agent execution is automatically recorded into
  [Outcome Memory](./outcome-memory.md) and the
  [Knowledge Graph](./knowledge-graph.md) — no extra setup needed.
