import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "./server";
import { AshOS } from "../sdk/ashos";

describe("AshOS API", () => {
  let server: Server;
  let baseUrl: string;
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-api-"));
    process.env.ASHOS_PROVIDER = "mock";
  });

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-api-"));
    const app = createServer(new AshOS({ root }));
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    server?.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("GET /health reports the active provider", async () => {
    const res = await fetch(`${baseUrl}/health`);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.provider).toBe("mock");
  });

  it("GET /agents lists registered agents", async () => {
    const res = await fetch(`${baseUrl}/agents`);
    const body = (await res.json()) as any;
    expect(body.length).toBeGreaterThan(0);
  });

  it("GET /agents/github-trending runs the agent and forwards ?limit as task input", async () => {
    // A dedicated server/agent so this test never touches the real network:
    // registering under the same name/capability overrides the real
    // GitHubTrendingAgent on this instance only.
    const stubRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-api-github-trending-"));
    const stubAshos = new AshOS({ root: stubRoot });
    let receivedInput: Record<string, unknown> | undefined;
    stubAshos.agents.register({
      name: "github-trending",
      description: "stub",
      capabilities: ["github-trending"],
      async execute(task) {
        receivedInput = task.input;
        return { ok: true, output: "1. acme/widget (100★)", data: { repos: [{ fullName: "acme/widget" }] } };
      }
    });
    const stubApp = createServer(stubAshos);
    const stubServer = await new Promise<Server>((resolve) => {
      const s = stubApp.listen(0, () => resolve(s));
    });
    try {
      const address = stubServer.address();
      const stubBaseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

      const res = await fetch(`${stubBaseUrl}/agents/github-trending?limit=3`);
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.repos).toEqual([{ fullName: "acme/widget" }]);
      expect(receivedInput).toEqual({ limit: 3 });
    } finally {
      stubServer.close();
      fs.rmSync(stubRoot, { recursive: true, force: true });
    }
  });

  it("POST /chat proxies to the active provider", async () => {
    const res = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "ping" }] })
    });
    const body = (await res.json()) as any;
    expect(body.content).toContain("ping");
  });

  it("POST /plan returns a task graph", async () => {
    const res = await fetch(`${baseUrl}/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal: "ship a feature" })
    });
    const body = (await res.json()) as any;
    expect(body.tasks.length).toBeGreaterThan(0);
  });

  it("POST /chat/stream streams chunks as plain text", async () => {
    const res = await fetch(`${baseUrl}/chat/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "stream this" }] })
    });
    const text = await res.text();
    expect(text).toContain("stream this");
  });

  it("POST /memory then GET /memory round-trips a record", async () => {
    await fetch(`${baseUrl}/memory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "session", key: "note-1", value: "remember this", tags: ["demo"] })
    });
    const res = await fetch(`${baseUrl}/memory?scope=session`);
    const body = (await res.json()) as any;
    expect(body.some((r: any) => r.key === "note-1")).toBe(true);
  });

  it("POST /memory/forget removes a record", async () => {
    await fetch(`${baseUrl}/memory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "session", key: "note-2", value: "temp" })
    });
    await fetch(`${baseUrl}/memory/forget`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "session", key: "note-2" })
    });
    const res = await fetch(`${baseUrl}/memory?scope=session`);
    const body = (await res.json()) as any;
    expect(body.some((r: any) => r.key === "note-2")).toBe(false);
  });

  it("POST /workflow runs a valid definition end to end", async () => {
    const res = await fetch(`${baseUrl}/workflow`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "api-test",
        steps: [{ id: "s1", uses: "agent:generic", params: { description: "say hi" } }]
      })
    });
    const body = (await res.json()) as any;
    expect(body.results.s1.status).toBe("success");
  });

  it("blocks a dangerous shell command reaching the testing agent through a workflow", async () => {
    const res = await fetch(`${baseUrl}/workflow`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "danger",
        steps: [{ id: "rm", uses: "agent:test", params: { command: "rm -rf /tmp/should-not-be-deleted" } }]
      })
    });
    const body = (await res.json()) as any;
    expect(body.results.rm.status).toBe("failed");
    expect(body.results.rm.error).toMatch(/permission denied/i);
  });

  it.each([
    ["/chat", {}],
    ["/chat", { messages: [] }],
    ["/plan", {}],
    ["/plan", { goal: "" }],
    ["/execute", {}],
    ["/workflow", { name: "no-steps" }],
    ["/workflow", { steps: [] }]
  ])("rejects an invalid body on POST %s with 400", async (route, body) => {
    const res = await fetch(`${baseUrl}${route}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as any;
    expect(json.error).toBeTruthy();
  });

  it("rejects /memory writes with an invalid scope or missing key", async () => {
    const badScope = await fetch(`${baseUrl}/memory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "not-a-scope", key: "k", value: "v" })
    });
    expect(badScope.status).toBe(400);

    const missingKey = await fetch(`${baseUrl}/memory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "session", value: "v" })
    });
    expect(missingKey.status).toBe(400);
  });

  it("GET /events supports prefix filtering", async () => {
    await fetch(`${baseUrl}/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal: "trigger an event" })
    });
    const res = await fetch(`${baseUrl}/events?prefix=memory:`);
    const body = (await res.json()) as any;
    expect(Array.isArray(body)).toBe(true);
    expect(body.every((e: any) => e.name.startsWith("memory:"))).toBe(true);
  });

  it("GET /innovation/collectors lists the default mock collectors", async () => {
    const res = await fetch(`${baseUrl}/innovation/collectors`);
    const body = (await res.json()) as any[];
    expect(body.map((c) => c.id).sort()).toEqual(
      ["mock-competitor", "mock-community", "mock-github", "mock-market", "mock-research", "mock-workflow"].sort()
    );
  });

  it("GET /innovation/config reflects the default innovation config", async () => {
    const res = await fetch(`${baseUrl}/innovation/config`);
    const body = (await res.json()) as any;
    expect(body.researchProvider).toBe("lmstudio");
    expect(body.domains).toContain("market");
  });

  it("PATCH /innovation/config merges the given fields and persists them", async () => {
    const res = await fetch(`${baseUrl}/innovation/config`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ briefSize: 3 })
    });
    const body = (await res.json()) as any;
    expect(body.briefSize).toBe(3);

    const after = (await (await fetch(`${baseUrl}/innovation/config`)).json()) as any;
    expect(after.briefSize).toBe(3);
  });

  it("GET /innovation/opportunities starts empty and /innovation/brief works with nothing discovered", async () => {
    const opportunities = (await (await fetch(`${baseUrl}/innovation/opportunities`)).json()) as any[];
    expect(opportunities).toEqual([]);

    const brief = (await (await fetch(`${baseUrl}/innovation/brief`)).json()) as any;
    expect(brief.topOpportunities).toEqual([]);
  });

  it("GET /innovation/opportunities/:id 404s for an unknown opportunity", async () => {
    const res = await fetch(`${baseUrl}/innovation/opportunities/does-not-exist`);
    expect(res.status).toBe(404);
  });

  it("POST /innovation/discover starts a cycle (202) whose results become queryable once it settles", async () => {
    // The mock intelligence agents complete a full cycle within a handful
    // of microtasks — too fast to reliably observe the 409-while-running
    // branch over a real HTTP round trip, so this only asserts the happy path.
    const res = await fetch(`${baseUrl}/innovation/discover`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domains: ["market"] })
    });
    expect(res.status).toBe(202);
    expect(((await res.json()) as any).started).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 200));

    const statusRes = (await (await fetch(`${baseUrl}/innovation/status`)).json()) as any;
    expect(statusRes.running).toBe(false);

    const opportunities = (await (await fetch(`${baseUrl}/innovation/opportunities`)).json()) as any[];
    expect(opportunities.length).toBeGreaterThan(0);

    const graphStats = (await (await fetch(`${baseUrl}/innovation/graph`)).json()) as any;
    expect(graphStats.nodeCount).toBeGreaterThan(0);

    const profile = (await (await fetch(`${baseUrl}/innovation/profile`)).json()) as any[];
    expect(profile.length).toBeGreaterThan(0);
  });
});
