import fs from "node:fs";
import path from "node:path";
import type { RepositoryProfile } from "./types";

/** Filesystem-safe key for a "owner/repo" full name. */
function slug(fullName: string): string {
  return fullName.replace(/[\\/]/g, "_");
}

/**
 * JSON-file-per-repository persistence for cached `RepositoryProfile`s —
 * same local-first pattern as `OpportunityStore`/`ExperimentStore`. Exists
 * specifically so `RepositoryAnalystAgent` can honor "never repeat
 * expensive analysis unless something changed": it reads the cached
 * profile's `pushedAt` and skips the costly languages/contributors/
 * dependencies calls when a fresh (cheap) repo fetch shows the same
 * `pushed_at`.
 */
export class RepositoryProfileStore {
  constructor(private readonly root: string) {}

  private dir(): string {
    return path.join(this.root, ".ashos", "innovation", "repositories");
  }

  private file(fullName: string): string {
    return path.join(this.dir(), `${slug(fullName)}.json`);
  }

  save(profile: RepositoryProfile): void {
    fs.mkdirSync(this.dir(), { recursive: true });
    fs.writeFileSync(this.file(profile.fullName), JSON.stringify(profile, null, 2));
  }

  get(fullName: string): RepositoryProfile | undefined {
    try {
      return JSON.parse(fs.readFileSync(this.file(fullName), "utf-8")) as RepositoryProfile;
    } catch {
      return undefined;
    }
  }

  /** All cached profiles, most recently analyzed first. */
  list(): RepositoryProfile[] {
    if (!fs.existsSync(this.dir())) return [];
    return fs
      .readdirSync(this.dir())
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(this.dir(), f), "utf-8")) as RepositoryProfile)
      .sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt));
  }
}
