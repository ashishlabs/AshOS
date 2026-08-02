# Feature: Live News Collectors & Daily Digest

**Status:** 🟡 In Progress (100% built; only GitHub confirmed reachable in this sandbox)

## 1. What is this feature?

Five real, opt-in collectors — GitHub, Hacker News, Reddit, arXiv, and
Hugging Face — pull actual live data (not mocked), which AshOS turns
into a deterministic Markdown "here's what happened in AI/tech today"
digest. Unlike the default `ash innovation discover` (which uses safe
offline mock data), this makes real outbound network calls.

**Business value:** a genuinely useful, zero-effort daily news summary —
run it once a day (manually or via the [Scheduler](./scheduler.md)) and
get a written report you could paste into a team channel, instead of
checking five different sites yourself.

## 2. Who is this for?

- **Anyone who wants an actual daily AI/tech news roundup** without
  visiting multiple sites.
- **Teams wanting a recurring "what's new" report** — pair this with the
  Scheduler for a fully automated morning digest.

## 3. How to use it

**Run a discovery cycle against every real collector:**
```bash
ash innovation discover --live
```

**Generate and save today's digest** (saved to `.ashos/innovation/digests/<date>.md`):
```bash
ash innovation digest
ash innovation digest --sources github-live,hn-live   # only specific sources
```

**See which live collectors exist:**
```bash
ash innovation collectors
```

**Via REST API:**
```bash
curl -X POST http://localhost:4700/innovation/discover -H "content-type: application/json" -d '{"live": true}'
curl -X POST http://localhost:4700/innovation/digest -H "content-type: application/json" -d '{}'
curl http://localhost:4700/innovation/live-collectors
```

## 4. Example walkthrough

```bash
ash innovation digest
cat .ashos/innovation/digests/$(date +%F).md
```
You get a Markdown file with today's notable stories, ready to paste
into Slack/email — one failing/rate-limited source never blocks the
others, since each collector is isolated.

## 5. Tips & limitations

- **These make real network calls** — unlike the rest of AshOS, this
  isn't offline-safe by default; it's explicit opt-in (`--live` /
  `ash innovation digest`) precisely because of that.
- **Only the GitHub collector has been verified live** in this
  project's own sandboxed development environment (network policy only
  allowlists `api.github.com`) — Hacker News, Reddit, arXiv, and
  Hugging Face are real, tested-against-mocked-fetch code that should
  work, but haven't been proven against the live internet from here.
  Try them yourself in an unrestricted environment.
- Only the Daily cadence exists — no Weekly/Monthly report generation yet.
