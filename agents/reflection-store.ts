import fs from "node:fs";
import path from "node:path";
import type { ReflectionData, ReflectionPeriod } from "./reflection";

/**
 * Persists a generated reflection to disk so it doesn't need to be
 * regenerated (another LLM call) every time someone opens the dashboard
 * or CLI on the same day — same "save the generated report" convention
 * `InnovationModule.generateDigest()` uses for `.ashos/innovation/digests/`.
 * One file per period per day, so a daily/weekly/monthly reflection
 * generated "today" can each be checked independently.
 *
 * Deliberately the same flat shape `ReflectionAgent.run()` already
 * returns (`ReflectionData` + `narrative`), plus `generatedAt` — so
 * `GET /reflect`, `GET /reflect?save=true`, and `GET /reflect?cached=true`
 * all hand back a structurally identical object regardless of which path
 * produced it.
 */
export interface SavedReflection extends ReflectionData {
  narrative: string;
  generatedAt: string;
}

function reflectionsDir(root: string): string {
  return path.join(root, ".ashos", "reflections");
}

/** Keyed by today's date, not the reflection's actual window — "was a reflection for this period already generated today" is the question this answers. */
export function reflectionFilePath(root: string, period: ReflectionPeriod, now: Date = new Date()): string {
  return path.join(reflectionsDir(root), `${period}-${now.toISOString().slice(0, 10)}.json`);
}

export function saveReflection(root: string, saved: SavedReflection, now: Date = new Date()): string {
  const dir = reflectionsDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = reflectionFilePath(root, saved.period, now);
  fs.writeFileSync(filePath, JSON.stringify(saved, null, 2), "utf-8");
  return filePath;
}

export function loadSavedReflection(root: string, period: ReflectionPeriod, now: Date = new Date()): SavedReflection | undefined {
  const filePath = reflectionFilePath(root, period, now);
  if (!fs.existsSync(filePath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as SavedReflection;
  } catch {
    return undefined;
  }
}
