# Feature: Memory

**Status:** ✅ Complete (4 scopes + semantic search)

## 1. What is this feature?

Memory is what stops AshOS from being a goldfish. It gives every session
and every project a persistent place to store facts, results, and
context — across four scopes with different lifetimes — plus semantic
(meaning-based, not just keyword) search over everything remembered.

**Business value:** without this, every `ash run`/`ash chat` starts from
zero. With it, AshOS can recall what it learned yesterday, what a
previous task's outcome was, or find "the thing about rate limiting we
discussed last week" even if you don't remember the exact words used.

## 2. Who is this for?

- **Anyone using AshOS across multiple sessions on the same project**,
  who wants continuity instead of re-explaining context every time.
- **Teams sharing a machine/project** — `project` scope persists to
  `.ashos/memory/project.json` and is shared by anyone working in that
  directory; `global` scope (`~/.ashos/memory/global.json`) follows you
  across every project.

## 3. How to use it

**The four scopes:**

| Scope | Lifetime | Use it for |
|---|---|---|
| `short-term` | In-process, optionally TTL-expiring | Scratch data within one run. |
| `session` | In-process, for the current session | Context that should survive across several calls in one process. |
| `project` | Persists to `.ashos/memory/project.json` | Facts specific to this codebase (outcomes, decisions, preferences). |
| `global` | Persists to `~/.ashos/memory/global.json` | Facts that should follow you everywhere. |

**Inspect what's remembered:**
```bash
ash memory list                         # everything
ash memory list --scope project         # just this project's memory
ash memory list --tag outcome           # every auto-recorded task outcome (see Outcome Memory)
ash memory list --tag failure           # just the failures
```

**Delete a specific record:**
```bash
ash memory forget project some-key
```

**Via REST API** (for your own integrations):
```bash
curl "http://localhost:4700/memory?scope=project&tag=outcome"
curl -X POST http://localhost:4700/memory \
  -H "content-type: application/json" \
  -d '{"scope": "project", "key": "preferred-style", "value": "prefer functional components", "tags": ["preference"]}'
```

**Semantic search** (find by meaning, not exact text) is available via
the SDK (`ashos.memory.searchSemantic("rate limiting approach")`) — every
`remember()` call best-effort computes an embedding with the active
provider so this works automatically as long as your provider supports
embeddings (see [AI Providers](./ai-providers.md)).

## 4. Example walkthrough

You want AshOS to remember a project convention so future runs respect it:

1. `curl -X POST http://localhost:4700/memory -d '{"scope":"project","key":"style-guide","value":"Always use named exports, never default exports.","tags":["convention"]}' -H "content-type: application/json"`
2. Later: `ash memory list --tag convention` to confirm it's there.
3. Any future agent run that queries memory (directly, or via semantic
   search) can surface this fact when relevant.

## 5. Tips & limitations

- `project`/`global` scopes do a full read-modify-write of the entire
  JSON file on every write — fine at current scale (including the
  now-automatic Outcome Memory volume), but not built for high write
  throughput.
- Semantic search quality depends entirely on your active provider's
  embeddings — the `mock` provider produces a deterministic but
  content-free vector, so semantic recall won't be meaningful until
  you're on a real provider.
- Memory records have no automatic expiration for `project`/`global`
  scope (only `short-term` supports a TTL) — use `ash memory forget` to
  clean up manually if needed.
