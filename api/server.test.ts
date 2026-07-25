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
});
