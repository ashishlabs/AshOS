import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RepositoryProfileStore } from "./repository-profile-store";
import type { RepositoryProfile } from "./types";

function profile(overrides: Partial<RepositoryProfile> = {}): RepositoryProfile {
  return {
    fullName: "acme/widget",
    url: "https://github.com/acme/widget",
    description: "A widget",
    primaryLanguage: "TypeScript",
    languages: { TypeScript: 1000 },
    topics: ["ai"],
    license: "MIT",
    stars: 100,
    forks: 10,
    openIssues: 2,
    watchers: 100,
    contributors: 3,
    dependencies: [],
    createdAt: "2025-01-01T00:00:00Z",
    pushedAt: "2026-08-01T00:00:00Z",
    maintenanceStatus: "active",
    innovationScore: 0.5,
    productionReadiness: 0.5,
    adoptionPotential: 0.5,
    ashosCompatibility: "High",
    analyzedAt: "2026-08-01T00:00:00Z",
    ...overrides
  };
}

describe("RepositoryProfileStore", () => {
  let root: string;
  let store: RepositoryProfileStore;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-repo-store-"));
    store = new RepositoryProfileStore(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns undefined for an unanalyzed repo", () => {
    expect(store.get("acme/widget")).toBeUndefined();
    expect(store.list()).toEqual([]);
  });

  it("saves and retrieves a profile by full name, including a slash", () => {
    store.save(profile());
    expect(store.get("acme/widget")?.fullName).toBe("acme/widget");
  });

  it("overwrites the cached profile for the same repo on re-analysis", () => {
    store.save(profile({ stars: 100 }));
    store.save(profile({ stars: 200 }));
    expect(store.get("acme/widget")?.stars).toBe(200);
    expect(store.list()).toHaveLength(1);
  });

  it("lists profiles most-recently-analyzed first", () => {
    store.save(profile({ fullName: "acme/old", analyzedAt: "2026-08-01T00:00:00Z" }));
    store.save(profile({ fullName: "acme/new", analyzedAt: "2026-08-02T00:00:00Z" }));
    expect(store.list()[0].fullName).toBe("acme/new");
  });
});
