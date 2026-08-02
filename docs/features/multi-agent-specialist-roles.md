# Feature: Multi-Agent Specialist Roles

**Status:** 🟡 In Progress (~40% — 5 of 11 named roles exist)

## 1. What is this feature?

The North Star vision for AshOS names 11 specialist "team member" roles
an AI Employee should have: Architect, Planner, Researcher, Developer,
Reviewer, Tester, Documentation Writer, Security Auditor, DevOps
Engineer, UI Designer, Video Creator. Today, generic-purpose equivalents
exist for 5 of them; 6 named specialists (Reviewer, Security Auditor,
DevOps Engineer, UI Designer, Architect, Video Creator) don't exist yet.

**Business value:** this is an honest status page, not a "how to use"
page for roles that don't exist — it tells you exactly which
capabilities you can rely on today versus which ones you'd need to
approximate with a generic agent or build yourself as a plugin.

## 2. Who is this for?

- **Anyone deciding whether AshOS can handle a specific kind of task**
  (e.g. "can it do a security review?") before running a goal and being
  surprised it fell back to a generic agent.
- **Developers wanting to add a missing specialist** — see
  [Plugin System](./plugin-system.md); a new named agent needs no new
  tools/infrastructure, just a `BaseAgent` subclass with a role-specific
  prompt (see `docs/roadmap-v2.md` Tier 2).

## 3. How to use what exists today

| North Star role | Today's equivalent | Capability | Use it via |
|---|---|---|---|
| Developer | **Code agent** | `code`, `implement` | `ash run "implement ..."` |
| Researcher | **Research agent** | `research`, `summarize` | `ash run "research ..."` |
| Tester | **Testing agent** | `test`, `verify` | `ash run "..."` (also fires automatically via the [Verification Gate](./verification-gate.md)) |
| Version control specialist | **Git agent** | `git`, `vcs` | Routed automatically for git-flavored tasks |
| General fallback | **Generic agent** | `generic` | Anything that doesn't match a specialist |

**Not yet available** — a goal needing these today falls back to the
Generic or Code agent instead:
- Reviewer (code review beyond pass/fail testing)
- Security Auditor
- DevOps Engineer
- UI Designer
- Architect
- Video Creator (also blocked on missing media-generation infrastructure)

## 4. Example walkthrough

You ask `ash run "do a security review of the auth module"`. Today,
there's no `Security Auditor` capability, so the Planner's task most
likely routes to the Generic or Research agent instead — you'll get a
best-effort answer from whatever agent matches, not a purpose-built
security-review workflow. Check `ash memory list --tag outcome` after
the run to see which agent actually handled it.

## 5. Tips & limitations

- This is the one remaining named gap in the North Star v2 milestone
  (Multi-Agent Collaboration) — see `docs/roadmap-v2.md`'s Tier 2 for
  the plan to close it.
- Building a missing role yourself is low effort: it's a `BaseAgent`
  subclass with a role-specific system prompt over the existing
  shell/git/fs tools, following the exact pattern in
  `agents/code-agent.ts` — no new infrastructure required.
