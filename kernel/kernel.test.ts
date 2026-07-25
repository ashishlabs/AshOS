import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Kernel } from "./kernel";
import { defaultConfig } from "./config";

describe("Kernel", () => {
  it("mirrors non-log event bus activity into the logger", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-kernel-"));
    const kernel = new Kernel({ root, config: defaultConfig() });

    kernel.eventBus.emit("agent:started", { agent: "code", task: "t1" });

    const entries = kernel.logger.getEntries();
    expect(entries.some((e) => e.message.includes("agent:started") && e.message.includes("code"))).toBe(true);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("does not recurse when logging itself emits a log event", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-kernel-"));
    const kernel = new Kernel({ root, config: defaultConfig() });

    const before = kernel.logger.getEntries().length;
    kernel.eventBus.emit("task:started", { id: "t1" });
    const after = kernel.logger.getEntries().length;

    // exactly one entry for the task:started mirror, not a cascade from "log" re-emission
    expect(after - before).toBe(1);

    fs.rmSync(root, { recursive: true, force: true });
  });
});
