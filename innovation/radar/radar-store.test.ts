import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RadarStore } from "./radar-store";
import type { RadarEntry } from "./types";

function entry(overrides: Partial<RadarEntry> = {}): RadarEntry {
  return {
    technology: "agents",
    ring: "growing",
    evidence: { totalMentions: 5, daysSinceFirstSeen: 10, daysSinceLastSeen: 1, mentionsPerDay: 0.5 },
    evaluatedAt: "2026-08-01T00:00:00Z",
    ...overrides
  };
}

describe("RadarStore", () => {
  let root: string;
  let store: RadarStore;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-radar-store-"));
    store = new RadarStore(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("loads an empty radar before anything is saved", () => {
    expect(store.load().entries).toEqual({});
    expect(store.list()).toEqual([]);
  });

  it("saves a full snapshot, replacing whatever was there before", () => {
    store.save([entry({ technology: "agents" })]);
    store.save([entry({ technology: "llm", ring: "emerging" })]);

    const radar = store.load();
    expect(Object.keys(radar.entries)).toEqual(["llm"]);
  });

  it("byRing filters to matching entries", () => {
    store.save([entry({ technology: "agents", ring: "growing" }), entry({ technology: "cobol", ring: "obsolete" })]);

    expect(store.byRing("growing").map((e) => e.technology)).toEqual(["agents"]);
    expect(store.byRing("obsolete").map((e) => e.technology)).toEqual(["cobol"]);
  });

  it("lists entries sorted by mentions-per-day descending", () => {
    store.save([
      entry({ technology: "slow", evidence: { totalMentions: 1, daysSinceFirstSeen: 10, daysSinceLastSeen: 1, mentionsPerDay: 0.1 } }),
      entry({ technology: "fast", evidence: { totalMentions: 10, daysSinceFirstSeen: 10, daysSinceLastSeen: 1, mentionsPerDay: 1.0 } })
    ]);

    expect(store.list().map((e) => e.technology)).toEqual(["fast", "slow"]);
  });
});
