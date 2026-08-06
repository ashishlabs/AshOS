# Feature: Multi-Agent Specialist Roles

**Status:** ✅ Mostly Complete (10 of 11 named roles exist or have a direct equivalent)

## 1. What is this feature?

The North Star vision for AshOS names 11 specialist "team member" roles
an AI Employee should have: Architect, Planner, Researcher, Developer,
Reviewer, Tester, Documentation Writer, Security Auditor, DevOps
Engineer, UI Designer, Video Creator. As of this update, 10 of them have a
real, working agent (or, for Planner, the `planner/` subsystem itself).
Only **Video Creator** remains unbuilt.

**Business value:** this is an honest status page, not a "how to use"
page for roles that don't exist — it tells you exactly which
capabilities you can rely on today versus which ones you'd need to
approximate with a generic agent or build yourself as a plugin.

## 2. Who is this for?

- **Anyone deciding whether AshOS can handle a specific kind of task**
  (e.g. "can it do a security review?") before running a goal — as of
  this update, a security review, code review, DevOps artifact, UI design
  proposal, or architecture proposal all route to a purpose-built agent
  instead of falling back to a generic one.
- **Developers wanting to add a missing specialist** — see
  [Plugin System](./plugin-system.md); a new named agent needs no new
  tools/infrastructure, just a `BaseAgent` subclass with a role-specific
  prompt, following the pattern the five specialists below already use.

## 3. How to use what exists today

| North Star role | Today's agent | Capability | Use it via |
|---|---|---|---|
| Developer | **Code agent** | `code`, `implement` | `ash run "implement ..."` |
| Researcher | **Research agent** | `research`, `summarize` | `ash run "research ..."` |
| Tester | **Testing agent** | `test`, `verify` | `ash run "..."` (also fires automatically via the [Verification Gate](./verification-gate.md)) |
| Planner | **`planner/` subsystem** | — (not a routed agent) | `ash plan "..."` / `ash run "..."` |
| Reviewer | **Reviewer agent** | `review`, `code-review` | `ash run "review ..."` or `AshOS.runAgent("review", { description, input: { file } })` |
| Security Auditor | **Security Auditor agent** | `security-audit` | `ash run "audit ... for vulnerabilities"` or `runAgent("security-audit", ...)` |
| DevOps Engineer | **DevOps agent** | `devops` | `ash run "write a Dockerfile for ..."` or `runAgent("devops", ...)` |
| UI Designer | **UI Designer agent** | `ui-design` | `ash run "design a settings page with ..."` or `runAgent("ui-design", ...)` |
| Architect | **Architect agent** | `architecture` | `ash run "propose an architecture for ..."` or `runAgent("architecture", ...)` |
| Documentation Writer | **Documentation agent** | `documentation`, `docs` | `ash docs generate --file <path>` / `--dir <path>`, `POST /docs/generate`, or `runAgent("documentation", { input: { file } })` — **not** planner-routed, see below |
| Version control specialist | **Git agent** | `git`, `vcs` | Routed automatically for git-flavored tasks |
| General fallback | **Generic agent** | `generic` | Anything that doesn't match a specialist |

The five specialists before Documentation Writer (Reviewer, Security
Auditor, DevOps, UI Designer, Architect) share the exact `CodeAgent`
shape: an optional `task.input.file` to read for context (Reviewer,
Security Auditor) or to write the produced artifact to (DevOps, UI
Designer, Architect) via the `fs` tool. Omit `input.file` and the result
comes back directly as `output` instead.

**Documentation Writer is deliberately not planner-routed.** The
Planner's `TaskGraph` shape (`{ id, title, description, capability,
dependsOn }`) never carries a structured `input` — the other five
specialists don't need one (they can act on free-text `task.description`
alone), but a documentation request fundamentally needs a real file or
module path, not a paraphrased sentence. Same reasoning `github-trending`
and `codebase-analyst` already use for staying direct-invoke-only
(`docs/architecture.md`) — call it via CLI/REST/`runAgent()` with an
explicit `input.file`/`input.dir` instead of `ash run "write docs for
..."`.

**Not yet available** — a goal needing this today falls back to the
Generic or Code agent instead:
- Video Creator (blocked on missing media-generation provider
  infrastructure — deferred with Creative Studio, `docs/roadmap-v2.md`
  goal #13)

## 4. Example walkthrough

You ask `ash run "do a security review of the auth module"`. The
Planner now routes this to the **Security Auditor** agent
(`security-audit` capability) instead of a generic fallback — you get a
structured review looking specifically for exploitable vulnerabilities
(injection, broken auth, secrets, SSRF, path traversal), not a generic
answer. Check `ash memory list --tag outcome` after the run to confirm
which agent actually handled it.

## 5. Tips & limitations

- Routing depends on the Planner correctly classifying a goal into one of
  the new capabilities (`review`/`security-audit`/`devops`/`ui-design`/
  `architecture`) — `planner/planner.ts`'s system prompt lists all five
  explicitly, but a live LLM provider can still misclassify an ambiguous
  goal. You can always bypass the Planner and call `AshOS.runAgent(...)`
  directly with the exact capability you want.
- Video Creator is the one remaining gap — see `docs/roadmap-v2.md`'s
  Tier 3 (deprioritized with the rest of Creative Studio).
- Building a missing role yourself is low effort: it's a `BaseAgent`
  subclass with a role-specific system prompt over the existing
  shell/git/fs tools, following the exact pattern in
  `agents/reviewer-agent.ts` or `agents/devops-agent.ts` — no new
  infrastructure required.
