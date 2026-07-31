import { describe, expect, it, vi, afterEach } from "vitest";
import { GitHubTrendingAgent } from "./github-trending-agent";
import { ToolRegistry } from "../tools/registry";
import { MockProvider } from "../providers/mock-provider";
import type { AgentContext } from "./types";

function repoItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    full_name: "acme/widget",
    html_url: "https://github.com/acme/widget",
    description: "A widget",
    stargazers_count: 100,
    forks_count: 10,
    language: "TypeScript",
    topics: ["ai"],
    pushed_at: "2026-07-01T00:00:00Z",
    ...overrides
  };
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

describe("GitHubTrendingAgent", () => {
  const context: AgentContext = { provider: new MockProvider(), tools: new ToolRegistry(), cwd: "/tmp" };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("merges and dedupes results across topics, sorted by stars descending", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ items: [repoItem({ full_name: "acme/low", stargazers_count: 50 })] }))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            repoItem({ full_name: "acme/high", stargazers_count: 900 }),
            repoItem({ full_name: "acme/low", stargazers_count: 50 }) // duplicate across topics
          ]
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const agent = new GitHubTrendingAgent();
    const result = await agent.execute({ id: "t1", description: "find trending repos", input: { topics: ["ai", "productivity"] } }, context);

    expect(result.ok).toBe(true);
    const data = result.data as { repos: { fullName: string }[] };
    expect(data.repos.map((r) => r.fullName)).toEqual(["acme/high", "acme/low"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("respects the limit option after merging", async () => {
    const items = Array.from({ length: 5 }, (_, i) => repoItem({ full_name: `acme/repo-${i}`, stargazers_count: i }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ items })));

    const agent = new GitHubTrendingAgent();
    const result = await agent.execute({ id: "t2", description: "x", input: { topics: ["ai"], limit: 2 } }, context);

    const data = result.data as { repos: unknown[] };
    expect(data.repos).toHaveLength(2);
  });

  it("skips a failing topic but still succeeds if another topic returns results", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false))
      .mockResolvedValueOnce(jsonResponse({ items: [repoItem()] }));
    vi.stubGlobal("fetch", fetchMock);

    const agent = new GitHubTrendingAgent();
    const result = await agent.execute({ id: "t3", description: "x", input: { topics: ["ai", "productivity"] } }, context);

    expect(result.ok).toBe(true);
    expect((result.data as { repos: unknown[] }).repos).toHaveLength(1);
  });

  it("returns a clear error when every topic request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const agent = new GitHubTrendingAgent();
    const result = await agent.execute({ id: "t4", description: "x", input: { topics: ["ai"] } }, context);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unreachable/);
  });

  it("builds the query with a topic filter and a pushed-since date", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const agent = new GitHubTrendingAgent();
    await agent.execute({ id: "t5", description: "x", input: { topics: ["productivity"], sinceDays: 7 } }, context);

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain(encodeURIComponent("topic:productivity"));
    expect(calledUrl).toContain(encodeURIComponent("pushed:>"));
  });

  it("declares its capabilities for routing", () => {
    const agent = new GitHubTrendingAgent();
    expect(agent.capabilities).toContain("github-trending");
    expect(agent.name).toBe("github-trending");
  });
});
