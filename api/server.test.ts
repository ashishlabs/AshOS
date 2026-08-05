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

  it("GET /providers/router starts disabled; PATCH updates it", async () => {
    const before = (await (await fetch(`${baseUrl}/providers/router`)).json()) as { enabled: boolean };
    expect(before.enabled).toBe(false);

    const patched = await fetch(`${baseUrl}/providers/router`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true, simpleProvider: "mock" })
    });
    const patchedBody = (await patched.json()) as { enabled: boolean; simpleProvider: string; standardProvider: string };
    expect(patchedBody.enabled).toBe(true);
    expect(patchedBody.simpleProvider).toBe("mock");
    // untouched fields survive the merge
    expect(patchedBody.standardProvider).toBeTruthy();

    // restore for other tests sharing this server instance
    await fetch(`${baseUrl}/providers/router`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false })
    });
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

    const events = (await (await fetch(`${baseUrl}/innovation/events`)).json()) as any[];
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toHaveProperty("category");

    const eventDetail = (await (await fetch(`${baseUrl}/innovation/events/${events[0].id}`)).json()) as any;
    expect(eventDetail.id).toBe(events[0].id);
  });

  it("GET /innovation/events/:id 404s for an unknown event", async () => {
    const res = await fetch(`${baseUrl}/innovation/events/does-not-exist`);
    expect(res.status).toBe(404);
  });

  it("POST /innovation/discover with live:true runs runLiveDiscovery instead of the domain cycle", async () => {
    // Overriding runLiveDiscovery on a dedicated instance keeps this test off the real network.
    const stubRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-api-live-discover-"));
    const stubAshos = new AshOS({ root: stubRoot });
    let called = false;
    stubAshos.innovation.runLiveDiscovery = async () => {
      called = true;
      return { opportunities: [], signalCount: 0, sources: [] };
    };
    const stubApp = createServer(stubAshos);
    const stubServer = await new Promise<Server>((resolve) => {
      const s = stubApp.listen(0, () => resolve(s));
    });
    try {
      const address = stubServer.address();
      const stubBaseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

      const res = await fetch(`${stubBaseUrl}/innovation/discover`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ live: true })
      });
      expect(res.status).toBe(202);
      expect(((await res.json()) as any).live).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(called).toBe(true);
    } finally {
      stubServer.close();
      fs.rmSync(stubRoot, { recursive: true, force: true });
    }
  });

  it("GET /innovation/live-collectors lists every real opt-in collector, not the offline mocks", async () => {
    const res = await fetch(`${baseUrl}/innovation/live-collectors`);
    const list = (await res.json()) as { id: string }[];
    const ids = list.map((c) => c.id).sort();
    expect(ids).toEqual(["arxiv-live", "github-live", "hn-live", "huggingface-live", "reddit-live"]);
  });

  it("POST /innovation/digest runs live discovery and returns the generated markdown + path", async () => {
    // Overriding generateDigest on a dedicated instance keeps this test off the real network.
    const stubRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-api-digest-"));
    const stubAshos = new AshOS({ root: stubRoot });
    stubAshos.innovation.generateDigest = async () => ({
      markdown: "# AshOS Daily AI News Digest — 2026-08-02\n",
      path: "/tmp/fake-digest.md",
      result: { opportunities: [], signalCount: 0, sources: [] }
    });
    const stubApp = createServer(stubAshos);
    const stubServer = await new Promise<Server>((resolve) => {
      const s = stubApp.listen(0, () => resolve(s));
    });
    try {
      const address = stubServer.address();
      const stubBaseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

      const res = await fetch(`${stubBaseUrl}/innovation/digest`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = (await res.json()) as { markdown: string; path: string };
      expect(body.markdown).toContain("AshOS Daily AI News Digest");
      expect(body.path).toBe("/tmp/fake-digest.md");
    } finally {
      stubServer.close();
      fs.rmSync(stubRoot, { recursive: true, force: true });
    }
  });

  it("GET /codebase starts empty; POST /codebase/index then GET /codebase/search find a real file on disk", async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-api-codebase-"));
    try {
      fs.writeFileSync(path.join(repoDir, "widget.ts"), "export function buildWidget() {}\n");

      const before = (await (await fetch(`${baseUrl}/codebase`)).json()) as unknown[];
      expect(before).toEqual([]);

      const indexRes = await fetch(`${baseUrl}/codebase/index`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ root: repoDir })
      });
      const indexBody = (await indexRes.json()) as { ok: boolean; output: string };
      expect(indexBody.ok).toBe(true);
      expect(indexBody.output).toContain("Indexed 1 file(s)");

      const searchRes = await fetch(`${baseUrl}/codebase/search?q=buildWidget&root=${encodeURIComponent(repoDir)}`);
      const searchBody = (await searchRes.json()) as { ok: boolean; output: string };
      expect(searchBody.ok).toBe(true);
      expect(searchBody.output).toContain("widget.ts");

      const after = (await (await fetch(`${baseUrl}/codebase`)).json()) as { root: string }[];
      expect(after.some((i) => i.root === repoDir)).toBe(true);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("GET /graph starts empty; running a goal populates agent/task/project nodes with real edges", async () => {
    const graphRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-api-graph-"));
    try {
      const graphAshos = new AshOS({ root: graphRoot });
      const graphApp = createServer(graphAshos);
      const graphServer = await new Promise<Server>((resolve) => {
        const s = graphApp.listen(0, () => resolve(s));
      });
      try {
        const address = graphServer.address();
        const graphBaseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

        const before = (await (await fetch(`${graphBaseUrl}/graph`)).json()) as { nodeCount: number };
        expect(before.nodeCount).toBe(0);

        await graphAshos.run("say hi");

        const after = (await (await fetch(`${graphBaseUrl}/graph`)).json()) as { nodeCount: number; byKind: Record<string, number> };
        expect(after.byKind).toMatchObject({ agent: 1, task: 1, project: 1 });

        const agentNodes = (await (await fetch(`${graphBaseUrl}/graph/nodes?kind=agent`)).json()) as { id: string; label: string }[];
        expect(agentNodes).toHaveLength(1);

        const neighbors = (await (await fetch(`${graphBaseUrl}/graph/nodes/${agentNodes[0].id}/neighbors`)).json()) as { edge: { kind: string } }[];
        expect(neighbors.some((n) => n.edge.kind === "produced-by")).toBe(true);
      } finally {
        graphServer.close();
      }
    } finally {
      fs.rmSync(graphRoot, { recursive: true, force: true });
    }
  });

  it("GET /codebase/search 400s without a 'q' query parameter", async () => {
    const res = await fetch(`${baseUrl}/codebase/search`);
    expect(res.status).toBe(400);
  });

  it("POST /inbox 400s without content", async () => {
    const res = await fetch(`${baseUrl}/inbox`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(400);
  });

  it("POST /inbox captures and classifies; GET /inbox lists it; GET /inbox/:id fetches it", async () => {
    const captureRes = await fetch(`${baseUrl}/inbox`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "https://github.com/anthropics/claude-code" })
    });
    expect(captureRes.status).toBe(201);
    const item = (await captureRes.json()) as { id: string; sourceType: string; status: string };
    expect(item.sourceType).toBe("github-repo");
    expect(item.status).toBe("unread");

    const listRes = await fetch(`${baseUrl}/inbox`);
    const list = (await listRes.json()) as { id: string }[];
    expect(list.some((i) => i.id === item.id)).toBe(true);

    const getRes = await fetch(`${baseUrl}/inbox/${item.id}`);
    expect(getRes.status).toBe(200);
    expect(((await getRes.json()) as { id: string }).id).toBe(item.id);
  });

  it("GET /inbox/:id 404s for an unknown id", async () => {
    const res = await fetch(`${baseUrl}/inbox/does-not-exist`);
    expect(res.status).toBe(404);
  });

  it("POST /inbox/:id/archive archives an item; unknown id 404s", async () => {
    const captureRes = await fetch(`${baseUrl}/inbox`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "archive me via api" })
    });
    const item = (await captureRes.json()) as { id: string };

    const archiveRes = await fetch(`${baseUrl}/inbox/${item.id}/archive`, { method: "POST" });
    expect(archiveRes.status).toBe(200);
    expect(((await archiveRes.json()) as { status: string }).status).toBe("archived");

    const missingRes = await fetch(`${baseUrl}/inbox/does-not-exist/archive`, { method: "POST" });
    expect(missingRes.status).toBe(404);
  });

  it("GET /inbox?status= filters by status", async () => {
    const filteredRes = await fetch(`${baseUrl}/inbox?status=archived`);
    const filtered = (await filteredRes.json()) as { status: string }[];
    expect(filtered.every((i) => i.status === "archived")).toBe(true);
  });

  it("POST /innovation/ideas 400s without inboxId or content", async () => {
    const res = await fetch(`${baseUrl}/innovation/ideas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(400);
  });

  it("POST /innovation/ideas scores raw content into an Opportunity", async () => {
    const res = await fetch(`${baseUrl}/innovation/ideas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "A tool that turns meeting notes into action items", tags: ["productivity"] })
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { opportunity: { title: string; tags: string[] }; created: boolean };
    expect(body.created).toBe(true);
    expect(body.opportunity.tags).toContain("productivity");
  });

  it("POST /innovation/ideas promotes an Inbox item and marks it reviewed", async () => {
    const captureRes = await fetch(`${baseUrl}/inbox`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Build a smarter changelog generator" })
    });
    const item = (await captureRes.json()) as { id: string };

    const ideaRes = await fetch(`${baseUrl}/innovation/ideas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inboxId: item.id })
    });
    expect(ideaRes.status).toBe(201);

    const promoted = await fetch(`${baseUrl}/inbox/${item.id}`);
    expect(((await promoted.json()) as { status: string }).status).toBe("reviewed");
  });

  it("POST /innovation/ideas 400s for an unknown inboxId", async () => {
    const res = await fetch(`${baseUrl}/innovation/ideas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inboxId: "does-not-exist" })
    });
    expect(res.status).toBe(400);
  });

  it("GET /reflect defaults to a daily period and works with nothing recorded", async () => {
    const res = await fetch(`${baseUrl}/reflect`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { period: string; narrative: string };
    expect(body.period).toBe("daily");
    expect(typeof body.narrative).toBe("string");
  });

  it("GET /reflect?period=weekly reflects real inbox activity from earlier tests on this shared server", async () => {
    const res = await fetch(`${baseUrl}/reflect?period=weekly`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { period: string; inbox: { captured: number } };
    expect(body.period).toBe("weekly");
    expect(body.inbox.captured).toBeGreaterThan(0);
  });

  it("GET /innovation/repositories starts empty; POST /innovation/repositories/analyze runs the agent and caches the result", async () => {
    // A stub RepositoryAnalystAgent so this never touches the real network.
    const stubRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-api-repo-"));
    const stubAshos = new AshOS({ root: stubRoot });
    stubAshos.agents.register({
      name: "repository-analyst",
      description: "stub",
      capabilities: ["repository-analyst"],
      async execute(task) {
        const fullName = task.input?.fullName as string;
        const profile = { fullName, stars: 42 };
        stubAshos.innovation.repositories.save(profile as any);
        return { ok: true, output: `${fullName}: analyzed`, data: { profile, cached: false } };
      }
    });
    const stubApp = createServer(stubAshos);
    const stubServer = await new Promise<Server>((resolve) => {
      const s = stubApp.listen(0, () => resolve(s));
    });
    try {
      const address = stubServer.address();
      const stubBaseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

      const empty = (await (await fetch(`${stubBaseUrl}/innovation/repositories`)).json()) as any[];
      expect(empty).toEqual([]);

      const missing = await fetch(`${stubBaseUrl}/innovation/repositories/acme/widget`);
      expect(missing.status).toBe(404);

      const analyzeRes = await fetch(`${stubBaseUrl}/innovation/repositories/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName: "acme/widget" })
      });
      expect(analyzeRes.status).toBe(200);
      expect(((await analyzeRes.json()) as any).ok).toBe(true);

      const cached = (await (await fetch(`${stubBaseUrl}/innovation/repositories/acme/widget`)).json()) as any;
      expect(cached.stars).toBe(42);

      const list = (await (await fetch(`${stubBaseUrl}/innovation/repositories`)).json()) as any[];
      expect(list).toHaveLength(1);
    } finally {
      stubServer.close();
      fs.rmSync(stubRoot, { recursive: true, force: true });
    }
  });

  it("POST /innovation/repositories/analyze rejects a missing or malformed fullName", async () => {
    const res = await fetch(`${baseUrl}/innovation/repositories/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fullName: "not-a-repo" })
    });
    expect(res.status).toBe(400);
  });

  it("GET /innovation/radar starts empty; POST /innovation/radar/refresh classifies tracked technologies", async () => {
    const empty = (await (await fetch(`${baseUrl}/innovation/radar`)).json()) as any[];
    expect(empty).toEqual([]);

    const refreshRes = await fetch(`${baseUrl}/innovation/radar/refresh`, { method: "POST" });
    expect(refreshRes.status).toBe(200);
    const body = (await refreshRes.json()) as any;
    expect(body.ok).toBe(true);

    const radar = (await (await fetch(`${baseUrl}/innovation/radar`)).json()) as any[];
    expect(radar.length).toBeGreaterThan(0);
    expect(radar[0]).toHaveProperty("ring");

    const filtered = (await (await fetch(`${baseUrl}/innovation/radar?ring=${radar[0].ring}`)).json()) as any[];
    expect(filtered.every((e: any) => e.ring === radar[0].ring)).toBe(true);
  });
});
