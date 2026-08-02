import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventStore } from "./event-store";
import type { Signal } from "../types";

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "sig-1",
    domain: "github",
    kind: "repository",
    source: "mock:github",
    title: "Fast-growing local-first agent framework",
    summary: "A trending repo",
    tags: ["agents", "developer-tools"],
    confidence: 0.6,
    observedAt: "2026-08-01T00:00:00Z",
    ...overrides
  };
}

describe("EventStore", () => {
  let root: string;
  let store: EventStore;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-event-store-"));
    store = new EventStore(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns an empty list before anything is upserted", () => {
    expect(store.list()).toEqual([]);
  });

  it("creates a new canonical event on the first upsert", () => {
    const { event, created } = store.upsert(signal());
    expect(created).toBe(true);
    expect(store.get(event.id)?.id).toBe(event.id);
    expect(store.list()).toHaveLength(1);
  });

  it("merges a near-duplicate signal into the existing event instead of creating a new one", () => {
    const first = store.upsert(signal());
    const second = store.upsert(
      signal({ id: "sig-2", source: "mock:community", title: "Fast-growing local-first agent orchestration framework" })
    );

    expect(second.created).toBe(false);
    expect(second.event.id).toBe(first.event.id);
    expect(second.event.occurrences).toBe(2);
    expect(store.list()).toHaveLength(1);
  });

  it("keeps unrelated signals as separate events", () => {
    store.upsert(signal());
    store.upsert(signal({ id: "sig-2", title: "Accountants re-key spreadsheets manually", tags: ["accounting"], kind: "workflow-friction" }));

    expect(store.list()).toHaveLength(2);
  });

  it("byCategory filters to matching canonical events", () => {
    store.upsert(signal({ kind: "repository" }));
    store.upsert(signal({ id: "sig-2", kind: "paper", title: "New evaluation technique for agents", tags: ["research"] }));

    expect(store.byCategory("repository")).toHaveLength(1);
    expect(store.byCategory("research-paper")).toHaveLength(1);
  });

  it("lists events most-recently-observed first", () => {
    store.upsert(signal({ observedAt: "2026-08-01T00:00:00Z" }));
    store.upsert(
      signal({ id: "sig-2", title: "Accountants re-key spreadsheets manually", tags: ["accounting"], kind: "workflow-friction", observedAt: "2026-08-02T00:00:00Z" })
    );

    const list = store.list();
    expect(list[0].lastObservedAt).toBe("2026-08-02T00:00:00Z");
  });
});
