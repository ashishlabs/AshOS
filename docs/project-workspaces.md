# Project Workspaces

Project Workspaces is a real, persisted `Project`/`ProjectTask`/`Milestone`
data model — not just a `project`-kind Knowledge Graph node identified by
working directory, which is all that existed before this shipped (see
`docs/knowledge-graph.md`'s "What gets recorded" — `BaseAgent` auto-creates
one of those for every agent run, keyed on `context.cwd`). It's the
Project Workspaces half of Second Brain roadmap Tier 3 item 7
(`docs/second-brain-roadmap.md`) — the Knowledge Vault half shipped
separately, see `docs/knowledge-vault.md`.

**Deliberately has no persistence engine of its own.** Projects, tasks,
and milestones are `MemoryManager` project-scope records tagged
`"workspace-project"`/`"workspace-task"`/`"workspace-milestone"` — the
same JSON-file store, tag query, and best-effort semantic embedding every
other memory record already gets, the same reuse convention
`InboxManager`/`VaultManager` established. See `docs/architecture.md`'s
`memory/` entry.

## Quick start

```bash
ash project create "Website redesign" --description "Refresh the marketing site" --tags marketing
ash project list                              # newest first
ash project list --status active
ash project show <id>
ash project progress <id>                     # percent complete, from tasks
ash project archive <id>

ash project task add <projectId> "Write docs"
ash project task list <projectId>
ash project task status <taskId> in-progress  # todo | in-progress | done

ash project milestone add <projectId> "Launch" --due 2026-09-01
ash project milestone list <projectId>
ash project milestone status <milestoneId> done  # pending | done
```

Or the REST API: `POST/GET /workspace/projects`, `GET /workspace/projects/:id`,
`POST /workspace/projects/:id/archive`, `GET /workspace/projects/:id/progress`,
`POST/GET /workspace/projects/:id/tasks`, `POST /workspace/tasks/:id/status`,
`POST/GET /workspace/projects/:id/milestones`,
`POST /workspace/milestones/:id/status`. Or the dashboard's **Projects**
tab (create + list + expand a project to see progress/tasks/milestones +
add/advance tasks + add/toggle milestones + archive).

## How it works

```
WorkspaceManager.createProject(name, description, opts)
        │
Project { id, name, description, status: "active", tags, ... }
        │
MemoryManager.remember("project", `workspace-project:<id>`, project, { tags: ["workspace-project", ...] })
        │
best-effort: KnowledgeGraph.upsertNode({ kind: "project", label: name, ... })
        │
eventBus.emit("workspace:project-created", { id, name })
```

Tasks and milestones follow the identical shape, each requiring an
existing `projectId`:

```
WorkspaceManager.addTask(projectId, title, opts)
        │
ProjectTask { id, projectId, title, description, status: "todo", ... }
        │
MemoryManager.remember(...) tagged "workspace-task"
        │
best-effort: KnowledgeGraph.upsertNode({ kind: "todo", label: "<project name>: <title>", ... })
             + addEdge(taskNode, projectNode, "part-of")
        │
eventBus.emit("workspace:task-created", { id, projectId, title })
```

`WorkspaceManager.progress(projectId)` is computed on the fly from
`listTasks(projectId)` — `{ totalTasks, doneTasks, percent }` — not stored
state, so it's always consistent with the current task list.

## A project's name is immutable

Same constraint, and the same reason, as a Vault note's title (see
`docs/knowledge-vault.md`): a project's `name` doubles as its Knowledge
Graph node's dedup key (`upsertNode` de-dupes by `(kind, label)`), so
renaming in place would either orphan the old graph node or require a
rename operation `KnowledgeGraph` doesn't have. `description`/`tags`/
`status` can still change after creation.

## `todo` and `milestone` are new, distinct Knowledge Graph node kinds

A persisted `ProjectTask` is **not** stored under the existing `task`
node kind, even though both represent "a task" in some sense. `task`
already means something specific and different: `BaseAgent` creates one
automatically for every agent *execution*, identified by `AgentTask.id`
(a run id, not a human title) — see `docs/knowledge-graph.md`. Reusing
`task` for a persisted, human-titled to-do item would risk an unrelated
agent run and an unrelated to-do item merging into the same graph node
if their labels ever happened to collide. `todo` (for `ProjectTask`) and
`milestone` (for `Milestone`) are new `KnowledgeNodeKind` values instead
— see `graph/types.ts`.

Every `todo`/`milestone` node's label is prefixed with its project's name
(`"<project name>: <title>"`) rather than just the task/milestone title
alone — this avoids a real, likely collision: two different projects each
having a task titled "Write docs" or "Setup CI" would otherwise merge
into one graph node (`upsertNode` de-dupes by `(kind, label)` globally,
not scoped per project).

## Knowledge Graph integration

Best-effort only — a graph write failure never fails project/task/
milestone creation, same pattern as `InboxManager`/`VaultManager`. Every
project becomes a `project` node (the same kind `BaseAgent` already
populates, distinguished by `data.workspaceProjectId`); every task
becomes a `todo` node with a `part-of` edge to its project node; every
milestone becomes a `milestone` node with a `part-of` edge to its project
node. See `docs/knowledge-graph.md`.

## Storage

No new file. Records live inside `.ashos/memory/project.json` as
ordinary `MemoryRecord`s with `scope: "project"`, keyed
`workspace-project:<id>` / `workspace-task:<id>` /
`workspace-milestone:<id>`, tagged accordingly.
`WorkspaceManager.listTasks(projectId)`/`listMilestones(projectId)` query
by the general `workspace-task`/`workspace-milestone` tag and then filter
in-memory by `projectId` — simpler than a compound tag query, and cheap
at Project Workspaces' expected scale (curated projects/tasks, not raw
captures).

## REST API

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/workspace/projects` | `{ name, description?, tags? }` | Create a project; `201`, `400` if `name` is missing/empty. |
| GET | `/workspace/projects?status=` | — | List projects, optionally filtered by status. |
| GET | `/workspace/projects/:id` | — | Fetch one project; `404` if unknown. |
| POST | `/workspace/projects/:id/archive` | — | Mark a project archived; `404` if unknown. |
| GET | `/workspace/projects/:id/progress` | — | `{ totalTasks, doneTasks, percent }`; `404` if the project is unknown. |
| POST | `/workspace/projects/:id/tasks` | `{ title, description? }` | Add a task to the project; `201`, `404` if the project is unknown, `400` if `title` is missing/empty. |
| GET | `/workspace/projects/:id/tasks?status=` | — | List tasks for the project, optionally filtered by status. |
| POST | `/workspace/tasks/:id/status` | `{ status }` | Update a task's status; `404` if unknown. |
| POST | `/workspace/projects/:id/milestones` | `{ title, dueDate? }` | Add a milestone to the project; `201`, `404` if the project is unknown. |
| GET | `/workspace/projects/:id/milestones?status=` | — | List milestones for the project, optionally filtered by status. |
| POST | `/workspace/milestones/:id/status` | `{ status }` | Update a milestone's status; `404` if unknown. |

## CLI

`ash project create <name> [--description] [--tags]`,
`ash project list [--status]`, `ash project show <id>`,
`ash project archive <id>`, `ash project progress <id>`,
`ash project task add <projectId> <title...> [--description]`,
`ash project task list <projectId> [--status]`,
`ash project task status <taskId> <status>`,
`ash project milestone add <projectId> <title...> [--due]`,
`ash project milestone list <projectId> [--status]`,
`ash project milestone status <milestoneId> <status>`.

## What's not implemented

- **No Roadmaps, Architecture docs, Definition of Done, or Risk tracking
  as data models** — `docs/progress/implementation-status.md`'s original
  Project Workspace audit named these as part of the vision; they remain
  hand-written Markdown (this very doc included), not something the
  system reasons over. Scoped out deliberately: each is its own
  meaningful chunk of new domain logic, not a natural extension of the
  Project/Task/Milestone model that shipped here.
- **No AI recommendations** ("what should I work on next") — nothing
  reasons over project/task state yet; that's downstream work once this
  data model existed for it to reason about.
- **No first-class link from a Vault note, Inbox item, or Innovation
  Opportunity to a Project** — association today is informal (a shared
  tag, or a manual Knowledge Graph edge). "Related projects" for Idea
  Lab/Research Hub, named in `docs/progress/roadmap.md`'s Phase 3, is
  still open.
- **No due-date reminders or overdue detection** — a milestone's
  `dueDate` is a plain stored string, not compared against the current
  date anywhere (e.g. by Reflection or Today's Focus).
