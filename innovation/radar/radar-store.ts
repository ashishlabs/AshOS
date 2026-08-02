import fs from "node:fs";
import path from "node:path";
import type { RadarEntry, RadarRing, TechnologyRadar } from "./types";

/**
 * Single JSON file (`.ashos/innovation/radar.json`) holding the last
 * computed classification per technology — same local-first pattern as
 * `BuilderProfileStore`. `TechnologyRadarAgent` recomputes and calls
 * `save()` wholesale each run; this store is just persistence + querying.
 */
export class RadarStore {
  constructor(private readonly root: string) {}

  private file(): string {
    return path.join(this.root, ".ashos", "innovation", "radar.json");
  }

  load(): TechnologyRadar {
    try {
      return JSON.parse(fs.readFileSync(this.file(), "utf-8")) as TechnologyRadar;
    } catch {
      return { updatedAt: new Date().toISOString(), entries: {} };
    }
  }

  save(entries: RadarEntry[]): TechnologyRadar {
    const radar: TechnologyRadar = { updatedAt: new Date().toISOString(), entries: Object.fromEntries(entries.map((e) => [e.technology, e])) };
    fs.mkdirSync(path.dirname(this.file()), { recursive: true });
    fs.writeFileSync(this.file(), JSON.stringify(radar, null, 2));
    return radar;
  }

  byRing(ring: RadarRing): RadarEntry[] {
    return Object.values(this.load().entries).filter((e) => e.ring === ring);
  }

  list(): RadarEntry[] {
    return Object.values(this.load().entries).sort((a, b) => b.evidence.mentionsPerDay - a.evidence.mentionsPerDay);
  }
}
