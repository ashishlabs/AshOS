import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { ScheduleStore } from "./schedule-store";

describe("ScheduleStore", () => {
  let root: string;
  let store: ScheduleStore;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-schedule-store-"));
    store = new ScheduleStore(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns an empty list when nothing has been added", () => {
    expect(store.list()).toEqual([]);
  });

  it("adds a goal-target schedule and lists it back", () => {
    const schedule = store.add({ cron: "0 9 * * *", description: "morning digest", target: { kind: "goal", goal: "summarize the news" } });
    expect(schedule.id).toBeTruthy();
    expect(schedule.createdAt).toBeTruthy();
    expect(store.list()).toEqual([schedule]);
  });

  it("adds a workflow-target schedule", () => {
    const schedule = store.add({ cron: "0 18 * * 5", target: { kind: "workflow", file: "./examples/workflows/research-and-build.json" } });
    expect(schedule.target).toEqual({ kind: "workflow", file: "./examples/workflows/research-and-build.json" });
  });

  it("rejects an invalid cron expression and persists nothing", () => {
    expect(() => store.add({ cron: "not-a-cron", target: { kind: "goal", goal: "x" } })).toThrow(/invalid cron/);
    expect(store.list()).toEqual([]);
  });

  it("persists across a fresh store instance pointed at the same root", () => {
    store.add({ cron: "0 9 * * *", target: { kind: "goal", goal: "x" } });
    const reopened = new ScheduleStore(root);
    expect(reopened.list()).toHaveLength(1);
  });

  it("get() finds a schedule by id, undefined for an unknown one", () => {
    const schedule = store.add({ cron: "0 9 * * *", target: { kind: "goal", goal: "x" } });
    expect(store.get(schedule.id)).toEqual(schedule);
    expect(store.get("missing")).toBeUndefined();
  });

  it("remove() deletes an existing schedule and returns true", () => {
    const schedule = store.add({ cron: "0 9 * * *", target: { kind: "goal", goal: "x" } });
    expect(store.remove(schedule.id)).toBe(true);
    expect(store.list()).toEqual([]);
  });

  it("remove() returns false for an unknown id and leaves the store untouched", () => {
    store.add({ cron: "0 9 * * *", target: { kind: "goal", goal: "x" } });
    expect(store.remove("missing")).toBe(false);
    expect(store.list()).toHaveLength(1);
  });
});
