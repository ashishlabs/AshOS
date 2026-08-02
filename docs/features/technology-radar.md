# Feature: Technology Radar

**Status:** ✅ Complete

## 1. What is this feature?

Classifies every technology AshOS has learned about (from Innovation
Intelligence's knowledge graph) into one of five rings — emerging,
growing, stable, declining, obsolete — using a deterministic,
evidence-based heuristic rather than a subjective guess.

**Business value:** a quick, standing answer to "is this technology
still worth betting on" — useful when deciding what to learn, adopt, or
deprecate, based on actual observed signal volume/recency rather than
hype.

## 2. Who is this for?

- **Technical leads/architects** deciding what to adopt or phase out.
- **Anyone tracking a specific technology's trajectory** over time as
  more signals accumulate.

## 3. How to use it

**View the current radar:**
```bash
ash innovation radar
```

**Force a recompute** from the latest knowledge graph data:
```bash
ash innovation radar --refresh
```

**Filter by ring:**
```bash
ash innovation radar --ring emerging
```

**Via REST API:**
```bash
curl "http://localhost:4700/innovation/radar?ring=growing"
curl -X POST http://localhost:4700/innovation/radar/refresh
```

**Or visually:** the dashboard's Innovation tab includes a Technology
Radar view (see [Dashboard](./dashboard.md)).

## 4. Example walkthrough

You want to check whether a technology you're considering is still gaining
traction:
```bash
ash innovation discover                # feed fresh signals in first
ash innovation radar --refresh
ash innovation radar --ring emerging   # see if it's classified as emerging
```

## 5. Tips & limitations

- Classification quality depends entirely on how much signal volume
  exists in the knowledge graph for that technology — a technology with
  almost no discovered signals won't classify meaningfully yet.
- Today's knowledge-graph entity extraction is still limited mostly to
  problem/technology nodes from mock/real collectors — richer sourcing
  will make the radar more accurate over time.
- Full technical detail: `docs/ashos-intelligence.md`.
