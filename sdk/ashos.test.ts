import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AshOS } from "./ashos";

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

  it("wires the Innovation Intelligence module in, with its agents registered on the shared AgentRegistry", async () => {
    const ashos = new AshOS({ root });
    expect(ashos.agents.findByCapability("intelligence:market")).toBeDefined();

    const { opportunities } = await ashos.innovation.runDiscoveryCycle(["market"]);
    expect(opportunities.length).toBeGreaterThan(0);
  });
});
