import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AshOS } from "./ashos";
import { loadSavedReflection } from "../agents/reflection-store";

describe("AshOS SDK facade", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-sdk-"));
    process.env.ASHOS_PROVIDER = "mock";
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("chats using the configured (mock) provider", async () => {
    const ashos = new AshOS({ root });
    const result = await ashos.chat([{ role: "user", content: "hello" }]);
    expect(result.content).toContain("hello");
  });

  it("plans and runs a goal end to end", async () => {
    const ashos = new AshOS({ root });
    const { graph, results } = await ashos.run("Ship a feature");
    expect(graph.tasks.length).toBeGreaterThan(0);
    expect([...results.values()].every((r) => r.status === "success")).toBe(true);
  });

  it("runs a workflow definition", async () => {
    const ashos = new AshOS({ root });
    const results = await ashos.runWorkflow({
      name: "smoke",
      steps: [{ id: "s1", uses: "agent:generic", params: { description: "say hi" } }]
    });
    expect(results.get("s1")?.status).toBe("success");
  });

  it("runAgent finds a registered agent by capability and executes it directly, bypassing the planner", async () => {
    const ashos = new AshOS({ root });
    const result = await ashos.runAgent("generic", { description: "say hi" });
    expect(result.ok).toBe(true);
    expect(result.output).toContain("say hi");
  });

  it("runAgent throws a clear error for an unregistered capability", async () => {
    const ashos = new AshOS({ root });
    await expect(ashos.runAgent("does-not-exist", { description: "x" })).rejects.toThrow(/no agent registered/);
  });

  it("registers the GitHubTrendingAgent under the github-trending capability", async () => {
    const ashos = new AshOS({ root });
    expect(ashos.agents.findByCapability("github-trending")?.name).toBe("github-trending");
  });

  it("registers the five specialist agents (Reviewer, Security Auditor, DevOps, UI Designer, Architect)", async () => {
    const ashos = new AshOS({ root });
    expect(ashos.agents.findByCapability("review")?.name).toBe("reviewer");
    expect(ashos.agents.findByCapability("security-audit")?.name).toBe("security-auditor");
    expect(ashos.agents.findByCapability("devops")?.name).toBe("devops");
    expect(ashos.agents.findByCapability("ui-design")?.name).toBe("ui-designer");
    expect(ashos.agents.findByCapability("architecture")?.name).toBe("architect");
  });

  it("wires the Innovation Intelligence module in, with its agents registered on the shared AgentRegistry", async () => {
    const ashos = new AshOS({ root });
    expect(ashos.agents.findByCapability("intelligence:market")).toBeDefined();

    const { opportunities } = await ashos.innovation.runDiscoveryCycle(["market"]);
    expect(opportunities.length).toBeGreaterThan(0);
  });

  it("generateAndSaveReflection() generates a reflection and persists it so loadSavedReflection() finds it", async () => {
    const ashos = new AshOS({ root });
    const saved = await ashos.generateAndSaveReflection("daily");
    expect(saved.period).toBe("daily");
    expect(typeof saved.narrative).toBe("string");
    expect(loadSavedReflection(root, "daily")).toEqual(saved);
  });

  it("generateAndSaveReflection() emits reflection:generated on the event bus", async () => {
    const ashos = new AshOS({ root });
    const seen: unknown[] = [];
    ashos.kernel.eventBus.on("reflection:generated", (e) => seen.push(e.payload));
    await ashos.generateAndSaveReflection("weekly");
    expect(seen).toEqual([{ period: "weekly" }]);
  });

  it("startScheduledJobs() registers the daily reflection job using config.reflection's cron, and does nothing when disabled", () => {
    const enabled = new AshOS({ root });
    enabled.startScheduledJobs();
    try {
      const job = enabled.scheduler.list().find((j) => j.id === "daily-reflection");
      expect(job).toBeDefined();
      expect(job?.cron).toBe(enabled.kernel.config.reflection.cron);
    } finally {
      enabled.scheduler.cancel("daily-reflection");
    }

    const disabledRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-sdk-reflection-disabled-"));
    try {
      const disabled = new AshOS({ root: disabledRoot });
      disabled.kernel.config.reflection.enabled = false;
      disabled.startScheduledJobs();
      expect(disabled.scheduler.list().find((j) => j.id === "daily-reflection")).toBeUndefined();
    } finally {
      fs.rmSync(disabledRoot, { recursive: true, force: true });
    }
  });

  it("does not schedule any jobs merely by being constructed", () => {
    const ashos = new AshOS({ root });
    expect(ashos.scheduler.list()).toHaveLength(0);
  });

  it("runWorkflowFile() reads and runs a workflow definition from disk", async () => {
    const ashos = new AshOS({ root });
    const file = path.join(root, "wf.json");
    fs.writeFileSync(file, JSON.stringify({ name: "smoke", steps: [{ id: "s1", uses: "agent:generic", params: { description: "say hi" } }] }));
    const results = await ashos.runWorkflowFile(file);
    expect(results.get("s1")?.status).toBe("success");
  });

  it("loadPersistedSchedules() registers every scheduleStore entry on the live scheduler", () => {
    const ashos = new AshOS({ root });
    const schedule = ashos.scheduleStore.add({ cron: "0 9 * * *", description: "morning", target: { kind: "goal", goal: "x" } });
    ashos.loadPersistedSchedules();
    try {
      const job = ashos.scheduler.list().find((j) => j.id === schedule.id);
      expect(job?.cron).toBe("0 9 * * *");
      expect(job?.description).toBe("morning");
    } finally {
      ashos.scheduler.stopAll();
    }
  });

  it("startScheduledJobs() also loads persisted schedules, not just the daily reflection", () => {
    const ashos = new AshOS({ root });
    const schedule = ashos.scheduleStore.add({ cron: "0 10 * * *", target: { kind: "goal", goal: "x" } });
    ashos.startScheduledJobs();
    try {
      expect(ashos.scheduler.list().some((j) => j.id === schedule.id)).toBe(true);
    } finally {
      ashos.scheduler.stopAll();
    }
  });

  it("a scheduled goal target actually plans and executes when its job fires", async () => {
    const ashos = new AshOS({ root });
    const schedule = ashos.scheduleStore.add({ cron: "0 9 * * *", target: { kind: "goal", goal: "say hi" } });
    ashos.loadPersistedSchedules();
    try {
      const job = ashos.scheduler.list().find((j) => j.id === schedule.id);
      await job!.run();
      expect(ashos.memory.query({ tag: "outcome" }).length).toBeGreaterThan(0);
    } finally {
      ashos.scheduler.stopAll();
    }
  });

  it("a scheduled workflow target reads and runs the workflow file when its job fires", async () => {
    const ashos = new AshOS({ root });
    const file = path.join(root, "wf.json");
    fs.writeFileSync(file, JSON.stringify({ name: "smoke", steps: [{ id: "s1", uses: "agent:generic", params: { description: "say hi" } }] }));
    const schedule = ashos.scheduleStore.add({ cron: "0 9 * * *", target: { kind: "workflow", file } });
    ashos.loadPersistedSchedules();
    try {
      const job = ashos.scheduler.list().find((j) => j.id === schedule.id);
      await job!.run();
      expect(ashos.memory.query({ tag: "outcome" }).length).toBeGreaterThan(0);
    } finally {
      ashos.scheduler.stopAll();
    }
  });

  it("scheduleRemove() cancels a live job and deletes the persisted definition", () => {
    const ashos = new AshOS({ root });
    const schedule = ashos.scheduleStore.add({ cron: "0 9 * * *", target: { kind: "goal", goal: "x" } });
    ashos.loadPersistedSchedules();
    expect(ashos.scheduleRemove(schedule.id)).toBe(true);
    expect(ashos.scheduler.list().find((j) => j.id === schedule.id)).toBeUndefined();
    expect(ashos.scheduleStore.list()).toEqual([]);
  });

  it("scheduleRemove() returns false for an unknown id", () => {
    const ashos = new AshOS({ root });
    expect(ashos.scheduleRemove("missing")).toBe(false);
  });
});
