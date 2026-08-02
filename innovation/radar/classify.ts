import type { RadarEntry, RadarEvidence, RadarRing } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeEvidence(totalMentions: number, createdAt: string, updatedAt: string, now = Date.now()): RadarEvidence {
  const daysSinceFirstSeen = Math.max(0, (now - new Date(createdAt).getTime()) / DAY_MS);
  const daysSinceLastSeen = Math.max(0, (now - new Date(updatedAt).getTime()) / DAY_MS);
  const mentionsPerDay = totalMentions / Math.max(1, daysSinceFirstSeen);
  return { totalMentions, daysSinceFirstSeen, daysSinceLastSeen, mentionsPerDay };
}

/**
 * Deterministic, evidence-based ring classification — no LLM call, so it's
 * cheap to recompute on every discovery cycle and trivial to unit test.
 * Rules (checked in order, first match wins):
 *
 *   obsolete  — not mentioned again in 180+ days, regardless of past volume.
 *   declining — not mentioned again in 60-180 days.
 *   emerging  — first seen within the last 30 days and already mentioned at least once more since.
 *   growing   — mentioned recently (within 60 days) at a sustained rate (≥0.5/day).
 *   stable    — mentioned recently but below the "growing" rate — the default for anything still active.
 */
export function classify(evidence: RadarEvidence): RadarRing {
  if (evidence.daysSinceLastSeen > 180) return "obsolete";
  if (evidence.daysSinceLastSeen > 60) return "declining";
  if (evidence.daysSinceFirstSeen <= 30 && evidence.totalMentions > 1) return "emerging";
  if (evidence.mentionsPerDay >= 0.5) return "growing";
  return "stable";
}

export function buildRadarEntry(technology: string, totalMentions: number, createdAt: string, updatedAt: string, now = Date.now()): RadarEntry {
  const evidence = computeEvidence(totalMentions, createdAt, updatedAt, now);
  return { technology, ring: classify(evidence), evidence, evaluatedAt: new Date(now).toISOString() };
}
