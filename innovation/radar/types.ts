export const RADAR_RINGS = ["emerging", "growing", "stable", "declining", "obsolete"] as const;
export type RadarRing = (typeof RADAR_RINGS)[number];

/** Transparent, numeric basis for a classification — "provide evidence supporting every classification." */
export interface RadarEvidence {
  totalMentions: number;
  daysSinceFirstSeen: number;
  daysSinceLastSeen: number;
  mentionsPerDay: number;
}

export interface RadarEntry {
  technology: string;
  ring: RadarRing;
  evidence: RadarEvidence;
  evaluatedAt: string;
}

export interface TechnologyRadar {
  updatedAt: string;
  entries: Record<string, RadarEntry>;
}
