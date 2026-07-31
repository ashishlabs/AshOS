import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BuilderProfileStore } from "./builder-profile-store";

describe("BuilderProfileStore", () => {
  let root: string;
  let store: BuilderProfileStore;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-profile-"));
    store = new BuilderProfileStore(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns an empty profile before anything is recorded", () => {
    expect(store.load().categories).toEqual({});
  });

  it("increments weight and signalCount every time a tag is observed", () => {
    store.recordSignal(["developer-tools"]);
    const profile = store.recordSignal(["developer-tools"]);

    expect(profile.categories["developer-tools"].signalCount).toBe(2);
    expect(profile.categories["developer-tools"].weight).toBeGreaterThan(0);
  });

  it("reinforces positively more than a plain observation", () => {
    store.recordSignal(["agents"]);
    const observedOnly = store.load().categories.agents.weight;

    const reinforced = store.reinforce(["agents"], "positive");
    expect(reinforced.categories.agents.weight).toBeGreaterThan(observedOnly);
  });

  it("never lets weight go below zero after negative reinforcement", () => {
    const profile = store.reinforce(["niche-tag"], "negative");
    expect(profile.categories["niche-tag"].weight).toBe(0);
  });

  it("ranks topCategories by weight descending", () => {
    store.recordSignal(["a"]);
    store.reinforce(["b"], "positive");
    store.reinforce(["b"], "positive");

    const top = store.topCategories(2);
    expect(top[0].category).toBe("b");
  });

  it("persists across store instances against the same root", () => {
    store.recordSignal(["persisted-tag"]);
    const reopened = new BuilderProfileStore(root);
    expect(reopened.load().categories["persisted-tag"]).toBeDefined();
  });
});
