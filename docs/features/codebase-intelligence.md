# Feature: Local Codebase Intelligence

**Status:** ✅ Complete (v1 scope)

## 1. What is this feature?

Indexes your actual local project — file tree, per-file language,
lightweight symbol extraction across TypeScript/JavaScript/Python/Go —
so you can ask "where does `EventBus` live" or "where is the login
handler defined" and get a real, ranked answer instead of manually
grepping. It's cached and only re-scans when your repository's git
commit actually changes.

**Business value:** this is a fast, always-current map of your own
codebase that any AshOS agent (or you, directly) can query — genuinely
useful on a large, unfamiliar, or fast-moving codebase where "just grep
it" starts to break down.

## 2. Who is this for?

- **Anyone working in a codebase they don't have memorized** — onboarding
  to a new project, or coming back to your own after months away.
- **AshOS agents themselves** — the Codebase Analyst agent uses this to
  answer "where does X live" questions as part of a larger goal.

## 3. How to use it

**Index your project** (defaults to the current directory):
```bash
ash codebase index
ash codebase index /path/to/other/repo
ash codebase index --force        # force a full re-scan even if cached
```

**Search it:**
```bash
ash codebase find EventBus
ash codebase find "login handler" --path /path/to/other/repo
```

**See everything you've indexed:**
```bash
ash codebase list
```

**Via REST API:**
```bash
curl -X POST http://localhost:4700/codebase/index -H "content-type: application/json" -d '{}'
curl "http://localhost:4700/codebase/search?q=EventBus"
curl http://localhost:4700/codebase
```

## 4. Example walkthrough

You just joined a project and want to find where authentication logic lives:
```bash
ash codebase index
ash codebase find "auth"
```
Results rank symbol-name matches ahead of path-only matches, so an
`authenticate()` function surfaces before a file merely named
`auth-utils.ts`.

## 5. Tips & limitations

- **Substring search only** — no semantic/embedding-based search yet
  (that's [Memory](./memory.md)'s domain, not this one).
- **No cross-file relationship tracking** (imports, call graphs) — this
  is the natural extension point tied to the
  [Knowledge Graph](./knowledge-graph.md).
- **No file-watching/auto-reindex** — you re-run `ash codebase index`
  after significant changes (it's cheap: cached and invalidated by git
  commit hash, so re-running when nothing changed is a no-op).
- Non-git directories always rescan (no commit hash to key the cache on).
- Full technical detail: `docs/codebase-intelligence.md`.
