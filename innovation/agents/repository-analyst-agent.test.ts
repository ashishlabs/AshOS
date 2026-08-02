import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RepositoryAnalystAgent } from "./repository-analyst-agent";
import { RepositoryProfileStore } from "../repository/repository-profile-store";
import { ToolRegistry } from "../../tools/registry";
import { MockProvider } from "../../providers/mock-provider";
import type { AgentContext } from "../../agents/types";

function repoResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    full_name: "acme/widget",
    html_url: "https://github.com/acme/widget",
    description: "A widget",
    language: "TypeScript",
    topics: ["ai", "cli"],
    license: { name: "MIT" },
    stargazers_count: 1000,
    forks_count: 100,
    open_issues_count: 10,
    watchers_count: 1000,
    created_at: "2025-01-01T00:00:00Z",
    pushed_at: "2026-08-01T00:00:00Z",
    ...overrides
  };
}

function jsonResponse(body: unknown, opts: { ok?: boolean; status?: number; headers?: Record<string, string> } = {}) {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: { get: (name: string) => opts.headers?.[name.toLowerCase()] ?? null },
    json: async () => body
  };
}

describe("RepositoryAnalystAgent", () => {
  let root: string;
  let context: AgentContext;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-repo-agent-"));
    context = { provider: new MockProvider(), tools: new ToolRegistry(), cwd: root };
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it("requires task.input.fullName", async () => {
    const agent = new RepositoryAnalystAgent();
    const result = await agent.execute({ id: "t1", description: "analyze" }, context);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/fullName/);
  });

  it("produces a structured RepositoryProfile from real API shapes and caches it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(repoResponse())) // GET /repos/:fullName
      .mockResolvedValueOnce(jsonResponse({ TypeScript: 900, Shell: 100 })) // languages
      .mockResolvedValueOnce(jsonResponse([{}], { headers: { link: '<...?page=7>; rel="last"' } })) // contributors
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 404 })); // package.json (not found — non-JS repo would 404, fine here too)
    vi.stubGlobal("fetch", fetchMock);

    const agent = new RepositoryAnalystAgent();
    const result = await agent.execute({ id: "t2", description: "analyze", input: { fullName: "acme/widget" } }, context);

    expect(result.ok).toBe(true);
    const data = result.data as { profile: { fullName: string; contributors: number; languages: Record<string, number> }; cached: boolean };
    expect(data.cached).toBe(false);
    expect(data.profile.fullName).toBe("acme/widget");
    expect(data.profile.contributors).toBe(7);
    expect(data.profile.languages).toEqual({ TypeScript: 900, Shell: 100 });

    const store = new RepositoryProfileStore(root);
    expect(store.get("acme/widget")?.pushedAt).toBe("2026-08-01T00:00:00Z");
  });

  it("skips the expensive calls and returns the cached profile when pushed_at is unchanged", async () => {
    const store = new RepositoryProfileStore(root);
    store.save({
      fullName: "acme/widget",
      url: "https://github.com/acme/widget",
      description: "A widget",
      primaryLanguage: "TypeScript",
      languages: { TypeScript: 900 },
      topics: ["ai"],
      license: "MIT",
      stars: 1000,
      forks: 100,
      openIssues: 10,
      watchers: 1000,
      contributors: 7,
      dependencies: [],
      createdAt: "2025-01-01T00:00:00Z",
      pushedAt: "2026-08-01T00:00:00Z",
      maintenanceStatus: "active",
      innovationScore: 0.5,
      productionReadiness: 0.8,
      adoptionPotential: 0.5,
      ashosCompatibility: "High",
      analyzedAt: "2026-08-01T00:00:00Z"
    });

    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(repoResponse({ pushed_at: "2026-08-01T00:00:00Z" })));
    vi.stubGlobal("fetch", fetchMock);

    const agent = new RepositoryAnalystAgent();
    const result = await agent.execute({ id: "t3", description: "analyze", input: { fullName: "acme/widget" } }, context);

    expect(result.ok).toBe(true);
    expect((result.data as { cached: boolean }).cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the cheap freshness check, not languages/contributors/package.json
  });

  it("re-analyzes when pushed_at has moved since the cached analysis", async () => {
    const store = new RepositoryProfileStore(root);
    store.save({
      fullName: "acme/widget",
      url: "https://github.com/acme/widget",
      description: "A widget",
      primaryLanguage: "TypeScript",
      languages: {},
      topics: [],
      license: "MIT",
      stars: 500,
      forks: 50,
      openIssues: 5,
      watchers: 500,
      contributors: 3,
      dependencies: [],
      createdAt: "2025-01-01T00:00:00Z",
      pushedAt: "2026-07-01T00:00:00Z",
      maintenanceStatus: "active",
      innovationScore: 0.4,
      productionReadiness: 0.6,
      adoptionPotential: 0.4,
      ashosCompatibility: "High",
      analyzedAt: "2026-07-01T00:00:00Z"
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(repoResponse({ pushed_at: "2026-08-01T00:00:00Z", stargazers_count: 1000 })))
      .mockResolvedValueOnce(jsonResponse({ TypeScript: 900 }))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const agent = new RepositoryAnalystAgent();
    const result = await agent.execute({ id: "t4", description: "analyze", input: { fullName: "acme/widget" } }, context);

    expect((result.data as { cached: boolean }).cached).toBe(false);
    expect((result.data as { profile: { stars: number } }).profile.stars).toBe(1000);
  });

  it("decodes a base64 package.json into a dependency list", async () => {
    const pkg = { dependencies: { react: "^18.0.0" }, devDependencies: { typescript: "^5.0.0" } };
    const encoded = Buffer.from(JSON.stringify(pkg)).toString("base64");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(repoResponse()))
      .mockResolvedValueOnce(jsonResponse({ TypeScript: 100 }))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ content: encoded, encoding: "base64" }));
    vi.stubGlobal("fetch", fetchMock);

    const agent = new RepositoryAnalystAgent();
    const result = await agent.execute({ id: "t5", description: "analyze", input: { fullName: "acme/widget" } }, context);

    const data = result.data as { profile: { dependencies: string[] } };
    expect(data.profile.dependencies).toEqual(expect.arrayContaining(["react", "typescript"]));
  });

  it("returns a clear error when GitHub returns a non-ok status for the repo itself", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 404 })));

    const agent = new RepositoryAnalystAgent();
    const result = await agent.execute({ id: "t6", description: "analyze", input: { fullName: "acme/missing" } }, context);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/404/);
  });

  it("classifies maintenance status and AshOS compatibility deterministically", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(repoResponse({ language: "Python", pushed_at: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString() }))
      )
      .mockResolvedValueOnce(jsonResponse({ Python: 100 }))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const agent = new RepositoryAnalystAgent();
    const result = await agent.execute({ id: "t7", description: "analyze", input: { fullName: "acme/old-python" } }, context);

    const data = result.data as { profile: { maintenanceStatus: string; ashosCompatibility: string } };
    expect(data.profile.maintenanceStatus).toBe("abandoned");
    expect(data.profile.ashosCompatibility).toMatch(/Medium/);
  });
});
