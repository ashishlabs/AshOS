# Local Codebase Intelligence

Local Codebase Intelligence indexes the actual repository AshOS is
working in — file tree, per-file language, lightweight symbol extraction —
so an agent can answer "where does feature X live" by reasoning from a
cached index instead of re-scanning or re-grepping the filesystem every
time. It's Stage 1 of the North Star feature plan in
`docs/roadmap-v2.md`, closing goal #4 (Repository Intelligence)'s "local
codebase" half.

**This is a different capability from `innovation/repository/`'s
`RepositoryAnalystAgent`**, which analyzes *external* GitHub repositories
through their public API (stars, license, languages, maintenance status)
for Innovation Intelligence. `codebase/` only ever touches the local
filesystem — no network calls at all — and indexes the repository AshOS
(or any local path you point it at) actually operates on.

## Quick start

```bash
ash codebase index              # index the current directory
ash codebase index ../other-repo   # or any other local path
ash codebase find "loginUser"   # search a previously indexed repo
ash codebase list               # show every repository indexed so far
```

Or the REST API: `POST /codebase/index`, `GET /codebase/search?q=`,
`GET /codebase`.

## How it works

```
scanRepository(root)  — walk the filesystem, skip node_modules/.git/dist/...
        │
detectLanguage(path) + extractSymbols(content, language)
        │  (regex-based per language — no AST dependency, same
        │   "good enough heuristic" tradeoff as RepositoryAnalystAgent's
        │   scoring functions)
        │
buildModules(files)  — roll files up by top-level directory
        │
CodebaseIndex  { root, commitHash, files, modules, indexedAt }
        │
CodebaseIndexStore  — persist to .ashos/codebase/<slug>.json
        │
searchIndex(index, query)  — case-insensitive substring match,
                              symbol-name matches ranked before path-only ones
```

All of `codebase/indexer.ts`'s functions (`detectLanguage`,
`extractSymbols`, `scanRepository`, `buildModules`, `searchIndex`) are
pure and independently unit tested — the agent below is orchestration
only.

## Caching — never repeat a full scan unless something changed

`CodebaseAnalystAgent` (`codebase/agents/codebase-analyst-agent.ts`,
capability `codebase-analyst`) mirrors `RepositoryAnalystAgent`'s "never
repeat expensive analysis unless something changed" rule, using the git
commit hash as the cheap fingerprint instead of `pushed_at`:

1. Run one cheap `git rev-parse HEAD` in the target root.
2. Compare it against the cached index's `commitHash`.
3. Unchanged → return the cached index immediately, no filesystem walk.
4. Changed (or no cache yet, or `force: true`) → re-scan, rebuild modules, save, and emit `codebase:indexed`.

**Known limitation**: a directory that isn't a git working tree has no
commit hash to cache against, so it's re-scanned on every call. This is a
documented tradeoff, not a silent correctness gap — most real repositories
AshOS operates on are git repositories.

## Symbol extraction — deliberately a heuristic, not a parser

`extractSymbols()` runs a small per-language regex table over each file
line by line (TypeScript/JavaScript: exported functions/classes/consts/
interfaces/types; Python: `def`/`class`; Go: `func`/`type`) rather than
depending on a real parser or language server. This is intentionally the
same tradeoff `RepositoryAnalystAgent`'s scoring heuristics and
`innovation/radar/classify.ts`'s classification rules make elsewhere in
AshOS: fast, dependency-free, and good enough for "where does X roughly
live" without the cost/complexity of per-language AST tooling. Files in
languages with no pattern table (or `.json`/`.md`) are still indexed for
file-path search, just without symbols.

## Querying

`ash codebase find <query>` / `GET /codebase/search?q=` run
`searchIndex()`: a case-insensitive substring match against every symbol
name and file path, with symbol-name matches ranked ahead of path-only
matches (a hit on the thing you named beats a hit on a directory that
happens to contain the word). No embeddings or vector search — deliberately
deterministic and instant, consistent with the rest of AshOS preferring
transparent heuristics over an LLM/embedding call wherever one is good
enough.

## Storage

One JSON file per indexed repository, `.ashos/codebase/<slug>.json`,
slugged from the absolute path being indexed — same one-file-per-record
pattern as `RepositoryProfileStore`/`OpportunityStore`. A single AshOS
project root can have multiple different repositories indexed and cached
at once (the store's own root and the repository being indexed are
independent — `ashos.codebase` lives under the current project's
`.ashos/`, but can index and cache any local path you point it at).

## REST API

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/codebase` | — | Every indexed repository. |
| POST | `/codebase/index` | `{ root?, force? }` | Index (or re-index) a repository; defaults to the AshOS project root. |
| GET | `/codebase/search?q=&root=` | — | Search a previously indexed repository; `400` if `q` is missing. |

## CLI

`ash codebase index [path] [--force]`, `ash codebase find <query>
[--path]`, `ash codebase list`.

## What's not implemented

- **No semantic/embedding-based search** — `searchIndex` is substring
  matching only. If exact-name search proves too limited in practice,
  feeding file/symbol content into `MemoryManager`'s existing
  `VectorStore` is the natural extension (same embeddings-via-active-
  provider mechanism `remember()` already uses), without changing the
  `CodebaseIndex` shape.
- **No cross-file relationship tracking** (imports, call graphs) — the
  index knows *what* is where, not *how* it's connected. That's a natural
  Stage 4 (General Knowledge Graph) extension: symbols/files as graph
  nodes, `imports`/`calls` as edges.
- **No re-indexing triggered by file-watching** — indexing only happens
  when explicitly asked (`ash codebase index`, or the agent's cache-miss
  path), consistent with AshOS's "nothing runs unless asked" convention
  elsewhere.
