import { describe, expect, it } from "vitest";
import { categorize, findDuplicate, mergeSignalIntoEvent, normalizeSignal, similarity } from "./normalizer";
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

describe("categorize", () => {
  it("maps a signal kind to its default event category", () => {
    expect(categorize(signal({ kind: "model-release", tags: [] }))).toBe("model-release");
    expect(categorize(signal({ kind: "paper", tags: [] }))).toBe("research-paper");
    expect(categorize(signal({ kind: "competitor-change", tags: [] }))).toBe("pricing-update");
  });

  it("lets a recognized tag override the kind-based category", () => {
    expect(categorize(signal({ kind: "repository", tags: ["framework"] }))).toBe("framework");
    expect(categorize(signal({ kind: "repository", tags: ["dataset"] }))).toBe("dataset");
  });

  it("falls back to developer-tool for unmapped kinds/tags", () => {
    expect(categorize(signal({ kind: "question", tags: ["random-tag"] }))).toBe("developer-tool");
  });
});

describe("similarity", () => {
  it("scores identical title+tags as maximally similar", () => {
    const a = { title: "New open-weight model beats benchmarks", tags: ["ai", "open-weight"] };
    expect(similarity(a, a)).toBe(1);
  });

  it("scores unrelated items as dissimilar", () => {
    const a = { title: "New open-weight model beats benchmarks", tags: ["ai"] };
    const b = { title: "Accountants re-key spreadsheets manually", tags: ["accounting"] };
    expect(similarity(a, b)).toBeLessThan(0.2);
  });

  it("scores near-duplicate reports of the same event as highly similar", () => {
    const a = { title: "OpenAI releases new coding model", tags: ["ai", "model-release"] };
    const b = { title: "OpenAI releases coding model update", tags: ["ai", "model-release"] };
    expect(similarity(a, b)).toBeGreaterThan(0.4);
  });
});

describe("normalizeSignal / mergeSignalIntoEvent / findDuplicate", () => {
  it("creates a fresh canonical event from a single signal", () => {
    const event = normalizeSignal(signal(), "evt-1");
    expect(event.id).toBe("evt-1");
    expect(event.category).toBe("repository");
    expect(event.sources).toHaveLength(1);
    expect(event.occurrences).toBe(1);
    expect(event.confidence).toBe(0.6);
  });

  it("merges a corroborating signal, raising confidence and preserving both sources", () => {
    const event = normalizeSignal(signal({ confidence: 0.5 }), "evt-1");
    const second = signal({ id: "sig-2", source: "mock:community", confidence: 0.5, tags: ["agents", "open-source"] });

    const merged = mergeSignalIntoEvent(event, second);

    expect(merged.occurrences).toBe(2);
    expect(merged.sources).toHaveLength(2);
    expect(merged.confidence).toBeGreaterThan(0.5); // corroboration raises confidence, never averages it down
    expect(merged.confidence).toBeLessThan(1);
    expect(merged.tags).toEqual(expect.arrayContaining(["agents", "developer-tools", "open-source"]));
  });

  it("findDuplicate matches a near-duplicate same-category event above the threshold", () => {
    const event = normalizeSignal(signal(), "evt-1");
    const duplicate = signal({ id: "sig-2", title: "Fast-growing local-first agent orchestration framework" });

    expect(findDuplicate(duplicate, [event])?.id).toBe("evt-1");
  });

  it("findDuplicate does not match across different categories even with similar text", () => {
    const event = normalizeSignal(signal({ kind: "repository", tags: ["agents"] }), "evt-1");
    const differentCategory = signal({ id: "sig-2", kind: "paper", tags: ["agents"], title: "Fast-growing local-first agent framework" });

    expect(findDuplicate(differentCategory, [event])).toBeUndefined();
  });

  it("findDuplicate returns undefined when nothing is similar enough", () => {
    const event = normalizeSignal(signal(), "evt-1");
    const unrelated = signal({ id: "sig-2", title: "Accountants re-key spreadsheets manually", tags: ["accounting"] });

    expect(findDuplicate(unrelated, [event])).toBeUndefined();
  });
});
