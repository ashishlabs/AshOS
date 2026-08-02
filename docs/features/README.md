# AshOS Feature Usage Guide

This directory answers one question per feature: **"I'm a user — what is
this for, and how do I actually use it?"** It's written from a
business-analyst perspective (value, target user, step-by-step usage),
which is a different lens than the rest of `docs/` — those files (e.g.
`docs/architecture.md`, `docs/model-router.md`) describe *how a feature is
built*; these describe *how to use it*.

Every file follows the same shape:

1. **What is this feature?** — the problem it solves, in plain language.
2. **Who is this for?** — the persona that benefits.
3. **How to use it** — concrete CLI / REST / SDK steps.
4. **Example walkthrough** — a realistic end-to-end scenario.
5. **Tips & limitations** — what it doesn't do yet, so expectations stay honest.

## Index

| Feature | What it's for |
|---|---|
| [AI Providers](./ai-providers.md) | Choose which AI backend (cloud or local) answers your requests. |
| [Model Router](./model-router.md) | Automatically send easy tasks to a cheap/local model, hard tasks to a strong one. |
| [Tools (Shell / Git / Fs)](./tools.md) | Let agents actually run commands, touch git, and read/write files. |
| [Agents](./agents.md) | The specialized workers that carry out tasks (write code, research, test, ...). |
| [Memory](./memory.md) | Give AshOS persistent, queryable memory across sessions and projects. |
| [Outcome Memory](./outcome-memory.md) | An automatic history of what every agent tried and whether it worked. |
| [Planner & Goal Execution](./planner-and-execution.md) | Turn a plain-English goal into a plan and run it end to end. |
| [Workflow Engine](./workflow-engine.md) | Define a repeatable multi-step process once, run it as many times as you like. |
| [Scheduler](./scheduler.md) | Run a workflow or goal automatically on a recurring schedule. |
| [Plugin System](./plugin-system.md) | Extend AshOS with your own tools, agents, and providers. |
| [REST API](./rest-api.md) | Drive AshOS from any language or app over HTTP. |
| [CLI (`ash`)](./cli.md) | Drive AshOS from your terminal. |
| [Dashboard](./dashboard.md) | A visual, no-terminal-required way to use AshOS. |
| [Innovation Intelligence](./innovation-intelligence.md) | Continuous discovery of market/tech opportunities worth acting on. |
| [Event Normalization](./event-normalization.md) | Deduplicated, categorized signals instead of raw noisy feeds. |
| [Repository Intelligence (external)](./repository-intelligence.md) | Get a structured due-diligence profile of any public GitHub repo. |
| [Local Codebase Intelligence](./codebase-intelligence.md) | Ask "where does X live" about your own project instead of grepping by hand. |
| [Technology Radar](./technology-radar.md) | Track whether a technology is emerging, stable, or dying. |
| [Live News Collectors & Digest](./live-collectors.md) | A daily "what happened in AI today" report, generated automatically. |
| [Knowledge Graph](./knowledge-graph.md) | See how your projects, agents, and past tasks connect. |
| [Multi-Agent Specialist Roles](./multi-agent-specialist-roles.md) | Which specialized "team members" exist today, and which are still backlog. |
| [Verification Gate](./verification-gate.md) | Make sure code AshOS writes is actually checked before being called "done." |

## What's not covered here

Six items from `PROJECT_STATUS.md`'s Feature Matrix are **not implemented
yet** — MCP client support, browser automation, Docker as an agent tool,
authentication, the Self-Improvement/Evaluation framework, and Creative
Studio (media generation). There is no "how to use" for a feature that
doesn't exist, so they're intentionally left out of this guide. See
`docs/roadmap-v2.md` for their status and `PROJECT_STATUS.md` for the
full evidence-based audit.
