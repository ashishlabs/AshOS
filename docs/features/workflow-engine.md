# Feature: Workflow Engine

**Status:** ✅ Complete (infrastructure); needs a CLI/UI author to be built

## 1. What is this feature?

Where the Planner improvises a task graph from a goal using an LLM, the
Workflow Engine runs a task graph *you already wrote down* as a JSON
file — the same dependency-graph executor, same parallelism/retry
behavior, but fully deterministic and repeatable, with no AI decision-
making about what steps to take. Each step either calls a tool
(`"uses": "tool:git"`) or an agent by capability (`"uses": "agent:code"`).

**Business value:** for a process you run over and over (a release
checklist, a recurring research-and-report pipeline), you don't want the
AI re-deciding the steps every time — you want the exact same steps, run
reliably, every time. That's a workflow.

## 2. Who is this for?

- **Anyone with a repeatable multi-step process** they want automated
  exactly the same way each time.
- **Anyone building on top of AshOS** (via the REST API or SDK) who
  wants deterministic orchestration rather than LLM-driven planning for
  a specific pipeline.

## 3. How to use it

Workflows are JSON files — see `examples/workflows/research-and-build.json`:
```json
{
  "name": "research-and-build",
  "description": "Research a topic, write the implementation, verify it, and report status.",
  "steps": [
    { "id": "research", "uses": "agent:research", "params": { "description": "Research best practices for the feature" } },
    { "id": "implement", "uses": "agent:code", "dependsOn": ["research"], "params": { "description": "Implement the feature", "file": "./generated/feature.ts" } },
    { "id": "test", "uses": "agent:test", "dependsOn": ["implement"], "params": { "command": "npm test" } },
    { "id": "status", "uses": "tool:git", "dependsOn": ["test"], "action": "status", "params": {} }
  ]
}
```

**Run it via REST API** (there's no `ash workflow run` CLI command yet —
this is the only current entry point outside writing your own script):
```bash
curl -X POST http://localhost:4700/workflow \
  -H "content-type: application/json" \
  --data-binary @examples/workflows/research-and-build.json
```

**Run it via the SDK** (in a Node script or your own app):
```ts
import { AshOS } from "ashos";
import definition from "./my-workflow.json";
const ashos = new AshOS();
const results = await ashos.runWorkflow(definition);
```

## 4. Example walkthrough

You want a repeatable "research → implement → test → report git status"
pipeline you can trigger from CI:

1. Copy `examples/workflows/research-and-build.json`, adjust the
   `description`/`file` params to your actual task.
2. Save it as `my-pipeline.json`.
3. From CI or a script: `curl -X POST http://localhost:4700/workflow --data-binary @my-pipeline.json`.
4. Inspect the returned `{ results }` map — one entry per step id, with
   `status`/`output`/`error`.

## 5. Tips & limitations

- **No CLI command exists yet** for running a workflow file directly
  (`ash workflow run <file>` isn't implemented) — today you need the
  REST API or the SDK. This is a straightforward gap to close if you
  need terminal-only usage.
- **No visual/drag-and-drop workflow builder** — you write the JSON by
  hand (see `docs/roadmap.md`).
- Steps run through the same `DagExecutor` as the Planner — dependent
  steps wait for their `dependsOn` list, independent steps run in
  parallel, and a failed step skips everything that depends on it.
