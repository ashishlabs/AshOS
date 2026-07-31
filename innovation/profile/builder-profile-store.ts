import fs from "node:fs";
import path from "node:path";
import type { BuilderProfile } from "../types";

const REINFORCEMENT: Record<"positive" | "negative", number> = { positive: 2, negative: -1 };

/**
 * "Personal Builder Profile": learns what kinds of products the user enjoys
 * building/tends to accept, tracked as a per-tag weight. Single JSON file
 * (`.ashos/innovation/builder-profile.json`), same local-first pattern as
 * `MemoryManager`'s project/global scopes — no external DB.
 */
export class BuilderProfileStore {
  constructor(private readonly root: string) {}

  private file(): string {
    return path.join(this.root, ".ashos", "innovation", "builder-profile.json");
  }

  load(): BuilderProfile {
    try {
      return JSON.parse(fs.readFileSync(this.file(), "utf-8")) as BuilderProfile;
    } catch {
      return { updatedAt: new Date().toISOString(), categories: {} };
    }
  }

  private write(profile: BuilderProfile): void {
    fs.mkdirSync(path.dirname(this.file()), { recursive: true });
    fs.writeFileSync(this.file(), JSON.stringify(profile, null, 2));
  }

  /** Every captured signal nudges its tags' weight up slightly, just from being observed. */
  recordSignal(tags: string[]): BuilderProfile {
    const profile = this.load();
    for (const tag of tags) {
      const existing = profile.categories[tag];
      profile.categories[tag] = existing
        ? { ...existing, weight: existing.weight + 0.5, signalCount: existing.signalCount + 1 }
        : { category: tag, weight: 0.5, signalCount: 1 };
    }
    profile.updatedAt = new Date().toISOString();
    this.write(profile);
    return profile;
  }

  /**
   * The Learning Loop: was a recommendation built/useful, or ignored/rejected?
   * Positive outcomes reinforce the opportunity's tags more strongly than a
   * plain observation does; negative outcomes actively discourage them (can
   * go below the pre-existing weight, never below 0) so future scoring
   * shifts away from patterns the user keeps rejecting.
   */
  reinforce(tags: string[], outcome: "positive" | "negative"): BuilderProfile {
    const profile = this.load();
    const delta = REINFORCEMENT[outcome];
    for (const tag of tags) {
      const existing = profile.categories[tag];
      const weight = Math.max(0, (existing?.weight ?? 0) + delta);
      profile.categories[tag] = { category: tag, weight, signalCount: (existing?.signalCount ?? 0) + 1 };
    }
    profile.updatedAt = new Date().toISOString();
    this.write(profile);
    return profile;
  }

  topCategories(limit = 10): BuilderProfile["categories"][string][] {
    return Object.values(this.load().categories)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, limit);
  }
}
