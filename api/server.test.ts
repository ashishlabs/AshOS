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
});
