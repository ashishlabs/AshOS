# Feature: Event Normalization & Dedup

**Status:** ✅ Complete

## 1. What is this feature?

Raw signals from Innovation Intelligence's collectors are noisy and
redundant — the same story might surface from multiple sources, worded
differently. This feature normalizes and deduplicates raw `Signal`s into
canonical `IntelligenceEvent`s, combining confidence when multiple
sources corroborate the same thing, before anything reaches the
opportunity engine or knowledge graph.

**Business value:** you see one clean, categorized event instead of five
near-duplicate signals about the same story — and when multiple
independent sources report the same thing, that's a meaningful "this is
more likely to matter" signal, not noise to manually filter.

## 2. Who is this for?

- **Anyone consuming Innovation Intelligence output** — you benefit from
  this automatically, without doing anything extra; it's the cleanup
  layer between raw discovery and what you actually see.

## 3. How to use it

You don't invoke this directly — it runs automatically as part of every
discovery cycle. What you interact with is its *output*:

**Browse canonical, deduplicated events:**
```bash
ash innovation events
ash innovation events --category funding
```

**Via REST API:**
```bash
curl http://localhost:4700/innovation/events
curl "http://localhost:4700/innovation/events?category=product-launch&limit=10"
curl http://localhost:4700/innovation/events/<id>
```

## 4. Example walkthrough

After running `ash innovation discover`, instead of digging through raw
per-domain signals, check the normalized view:
```bash
ash innovation events -c funding -l 10
```
Each event already has duplicates merged and a combined confidence
score — you're looking at the cleaned-up picture, not the raw feed.

## 5. Tips & limitations

- Category coverage today is limited to what the underlying collectors
  can supply structure for — richer entity extraction (beyond
  problem/technology) is future work, tied to real collectors maturing.
- This feature has no standalone "run it manually" entry point — it's
  wired into the discovery pipeline, not a separate command.
- Full technical detail: `docs/ashos-intelligence.md`.
