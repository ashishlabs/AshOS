# Feature: Innovation Intelligence (Opportunity Discovery)

**Status:** ✅ Complete

## 1. What is this feature?

An always-available "opportunity scout" — it discovers signals (market
moves, GitHub activity, community discussion, research, workflow gaps,
competitor moves), merges related ones together, scores them across 15
dimensions, and ranks them so you can see what's actually worth acting
on, instead of manually monitoring six different kinds of sources
yourself.

**Business value:** this is market/competitive/technical awareness on
autopilot. Instead of you personally scanning GitHub trending, Hacker
News, and research feeds every morning, AshOS does it and hands you a
ranked shortlist plus a narrative Daily Brief.

## 2. Who is this for?

- **Founders/product people** scanning for market opportunities or
  competitive moves worth reacting to.
- **Developers** who want a standing radar on what's emerging in their
  technical space without manually checking five different sites.

## 3. How to use it

**Run a discovery cycle** (uses offline deterministic mock collectors by
default — safe to run any time, no network calls):
```bash
ash innovation discover
ash innovation discover --domains market,github    # restrict to specific domains
```

**See what it found:**
```bash
ash innovation list                 # ranked opportunities, highest score first
ash innovation show <id>            # full detail: score breakdown, evidence signals
```

**Get a narrative summary:**
```bash
ash innovation brief                # today's Daily Innovation Brief
```

**See what it's learned about your preferences:**
```bash
ash innovation profile              # learned Builder Profile (which categories you favor)
```

**Via REST API:**
```bash
curl -X POST http://localhost:4700/innovation/discover -H "content-type: application/json" -d '{}'
curl http://localhost:4700/innovation/opportunities
curl http://localhost:4700/innovation/brief
```

**Or visually:** the dashboard's Innovation tab (see [Dashboard](./dashboard.md)).

## 4. Example walkthrough

```bash
ash innovation discover
ash innovation list -l 5
ash innovation show <top-id>
ash innovation brief
```
This surfaces the top 5 ranked opportunities from this cycle, lets you
drill into the highest-scoring one to see exactly what evidence
generated the score, then get a written narrative you could paste
straight into a Slack update.

## 5. Tips & limitations

- **`ash innovation discover` uses mock (offline, deterministic)
  collectors by default** — real, opt-in live collectors (GitHub, HN,
  Reddit, arXiv, Hugging Face) are a separate feature — see
  [Live News Collectors & Digest](./live-collectors.md) for real-data usage.
- No automatic project/task scaffolding when you accept an opportunity —
  today it's discovery and scoring, not "and now build it for me"
  (though nothing stops you from feeding an opportunity's description
  into `ash run` yourself).
- Full technical detail: `docs/innovation.md`.
