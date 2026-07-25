import { describe, expect, it } from "vitest";
import { EventBus } from "./event-bus";

describe("EventBus", () => {
  it("delivers events to specific and wildcard listeners", () => {
    const bus = new EventBus();
    const specific: unknown[] = [];
    const wildcard: unknown[] = [];

    bus.on("task:started", (e) => specific.push(e.payload));
    bus.on("*", (e) => wildcard.push(e.name));

    bus.emit("task:started", { id: "t1" });

    expect(specific).toEqual([{ id: "t1" }]);
    expect(wildcard).toEqual(["task:started"]);
  });

  it("records bounded history", () => {
    const bus = new EventBus({ maxHistory: 2 });
    bus.emit("log", { n: 1 });
    bus.emit("log", { n: 2 });
    bus.emit("log", { n: 3 });

    const history = bus.getHistory("log");
    expect(history).toHaveLength(2);
    expect(history.map((e) => (e.payload as { n: number }).n)).toEqual([2, 3]);
  });

  it("allows unsubscribing", () => {
    const bus = new EventBus();
    let count = 0;
    const off = bus.on("task:finished", () => count++);
    bus.emit("task:finished", {});
    off();
    bus.emit("task:finished", {});
    expect(count).toBe(1);
  });
});
