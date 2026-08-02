# Feature: Repository Intelligence (External)

**Status:** ✅ Complete

## 1. What is this feature?

Point this at any public GitHub repository and get back a structured
due-diligence profile: languages, contributors, dependencies, license,
and four deterministic heuristic scores — maintenance, innovation,
production-readiness, and adoption — plus an AshOS-compatibility note.
It's a real GitHub API call, cached so repeated analysis of the same
repo isn't wasted work.

**Business value:** this is "should we depend on this / is this project
healthy / is this a real competitor" answered in one command instead of
manually reading a README, checking commit history, and eyeballing
stars.

## 2. Who is this for?

- **Anyone evaluating a dependency** before adopting it in a project.
- **Anyone doing competitive research** on a specific project/company's
  open-source presence.

## 3. How to use it

**Analyze a repository:**
```bash
ash innovation repo analyze ollama/ollama
```

**List everything you've analyzed so far:**
```bash
ash innovation repo list
```

**Via REST API:**
```bash
curl -X POST http://localhost:4700/innovation/repositories/analyze \
  -H "content-type: application/json" -d '{"fullName": "ollama/ollama"}'

curl http://localhost:4700/innovation/repositories/ollama/ollama
curl http://localhost:4700/innovation/repositories
```

## 4. Example walkthrough

You're deciding whether to depend on a library:
```bash
ash innovation repo analyze vercel/next.js
```
Output includes real star count, primary languages, license,
contributor activity, and the four heuristic scores — enough to make an
informed adoption call without leaving the terminal. Run it again later
and it's served from cache unless the repo has new commits
(`pushed_at`-based invalidation).

## 5. Tips & limitations

- Requires real network access to `api.github.com` — this doesn't work
  fully offline (unlike most of AshOS).
- GitHub's secondary rate limiting can kick in on rapid repeated calls —
  handled gracefully (returns an error result, doesn't crash), but don't
  script analyzing hundreds of repos back-to-back.
- Distinct from [Local Codebase Intelligence](./codebase-intelligence.md),
  which indexes *your own* local working repository, not an external one.
