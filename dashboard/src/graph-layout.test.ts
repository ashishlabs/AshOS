import { describe, expect, it } from "vitest";
import { computeForceLayout, kindColor } from "./graph-layout";

describe("computeForceLayout", () => {
  it("returns an empty map for no nodes", () => {
    const positions = computeForceLayout([], []);
    expect(positions.size).toBe(0);
  });

  it("places every node within the given bounds", () => {
    const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const edges = [{ from: "a", to: "b" }];
    const positions = computeForceLayout(nodes, edges, { width: 400, height: 300, iterations: 20 });

    expect(positions.size).toBe(3);
    for (const id of ["a", "b", "c"]) {
      const p = positions.get(id);
      expect(p).toBeDefined();
      expect(p!.x).toBeGreaterThanOrEqual(0);
      expect(p!.x).toBeLessThanOrEqual(400);
      expect(p!.y).toBeGreaterThanOrEqual(0);
      expect(p!.y).toBeLessThanOrEqual(300);
    }
  });

  it("is deterministic for the same input", () => {
    const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const edges = [{ from: "a", to: "b" }, { from: "b", to: "c" }];

    const first = computeForceLayout(nodes, edges, { iterations: 50 });
    const second = computeForceLayout(nodes, edges, { iterations: 50 });

    for (const id of ["a", "b", "c", "d"]) {
      expect(second.get(id)).toEqual(first.get(id));
    }
  });

  it("ignores edges referencing unknown or self nodes", () => {
    const nodes = [{ id: "a" }, { id: "b" }];
    const edges = [{ from: "a", to: "missing" }, { from: "a", to: "a" }];

    const positions = computeForceLayout(nodes, edges, { iterations: 10 });
    expect(positions.size).toBe(2);
  });

  it("single node settles near the center", () => {
    const positions = computeForceLayout([{ id: "solo" }], [], { width: 800, height: 600, iterations: 50 });
    const p = positions.get("solo")!;
    expect(p.x).toBeGreaterThan(0);
    expect(p.y).toBeGreaterThan(0);
  });
});

describe("kindColor", () => {
  it("is deterministic for the same kind", () => {
    expect(kindColor("project")).toBe(kindColor("project"));
  });

  it("returns a valid hsl() string", () => {
    expect(kindColor("agent")).toMatch(/^hsl\(\d+, 65%, 55%\)$/);
  });

  it("gives different kinds a distinct color in the common case", () => {
    expect(kindColor("project")).not.toBe(kindColor("agent"));
  });
});
