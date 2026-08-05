import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSavedReflection, reflectionFilePath, saveReflection, type SavedReflection } from "./reflection-store";

const EMPTY_DAILY: Omit<SavedReflection, "narrative" | "generatedAt"> = {
  period: "daily",
  windowStart: "2026-01-01T00:00:00.000Z",
  windowEnd: "2026-01-02T00:00:00.000Z",
  outcomes: { total: 0, success: 0, failure: 0, failures: [] },
  inbox: { captured: 0, reviewed: 0, archived: 0 },
  knowledgeGraph: { newNodes: 0, byKind: {} }
};

describe("reflection-store", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-reflection-store-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns undefined when nothing has been saved yet", () => {
    expect(loadSavedReflection(root, "daily")).toBeUndefined();
  });

  it("round-trips a saved reflection", () => {
    const saved: SavedReflection = { ...EMPTY_DAILY, generatedAt: "2026-01-02T00:00:00.000Z", narrative: "Nothing recorded today yet." };
    const filePath = saveReflection(root, saved);

    expect(fs.existsSync(filePath)).toBe(true);
    expect(loadSavedReflection(root, "daily")).toEqual(saved);
  });

  it("is the same flat shape ReflectionAgent.run() returns — no nested 'data' wrapper", () => {
    const saved: SavedReflection = { ...EMPTY_DAILY, generatedAt: "2026-01-02T00:00:00.000Z", narrative: "Nothing recorded today yet." };
    saveReflection(root, saved);
    const loaded = loadSavedReflection(root, "daily")!;
    expect(loaded.period).toBe("daily");
    expect(loaded.outcomes.total).toBe(0);
    expect(loaded.narrative).toBe("Nothing recorded today yet.");
    expect((loaded as unknown as { data?: unknown }).data).toBeUndefined();
  });

  it("keys the saved file by today's date, not the reflection's own window", () => {
    const now = new Date("2026-03-15T12:00:00.000Z");
    const saved: SavedReflection = { ...EMPTY_DAILY, period: "weekly", generatedAt: now.toISOString(), narrative: "Weekly review." };
    const filePath = saveReflection(root, saved, now);

    expect(filePath).toBe(reflectionFilePath(root, "weekly", now));
    expect(path.basename(filePath)).toBe("weekly-2026-03-15.json");
    expect(loadSavedReflection(root, "weekly", now)).toEqual(saved);
  });

  it("keeps daily/weekly/monthly saves independent for the same day", () => {
    const now = new Date("2026-03-15T12:00:00.000Z");
    saveReflection(root, { ...EMPTY_DAILY, generatedAt: now.toISOString(), narrative: "daily" }, now);
    saveReflection(root, { ...EMPTY_DAILY, period: "monthly", generatedAt: now.toISOString(), narrative: "monthly" }, now);

    expect(loadSavedReflection(root, "daily", now)?.narrative).toBe("daily");
    expect(loadSavedReflection(root, "monthly", now)?.narrative).toBe("monthly");
    expect(loadSavedReflection(root, "weekly", now)).toBeUndefined();
  });

  it("returns undefined instead of throwing on a corrupted file", () => {
    const filePath = reflectionFilePath(root, "daily");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "not valid json{{{", "utf-8");

    expect(loadSavedReflection(root, "daily")).toBeUndefined();
  });
});
