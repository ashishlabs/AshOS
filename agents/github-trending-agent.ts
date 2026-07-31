import { BaseAgent } from "./base-agent";
import type { AgentContext, AgentResult, AgentTask } from "./types";

export interface TrendingRepo {
  fullName: string;
  url: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  topics: string[];
  pushedAt: string;
}

interface GitHubSearchItem {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics?: string[];
  pushed_at: string;
}

const DEFAULT_TOPICS = ["ai", "artificial-intelligence", "productivity", "llm", "ai-agents", "automation"];
const GITHUB_SEARCH_URL = "https://api.github.com/search/repositories";

/**
 * Finds trending GitHub repositories in the AI/productivity space by
 * querying the public Search API directly (raw `fetch`, no SDK — same
 * pattern as the AIProvider implementations). GitHub has no official
 * "trending" endpoint, so "trending" here means: real repositories tagged
 * with a relevant topic that were pushed to recently, ranked by stars.
 * Runs one request per topic and merges + dedupes the results so a single
 * rate-limited or slow topic doesn't fail the whole call.
 */
export class GitHubTrendingAgent extends BaseAgent {
  name = "github-trending";
  description = "Finds trending GitHub repositories focused on AI and productivity";
  capabilities = ["github-trending", "trending-repos"];

  async run(task: AgentTask, _context: AgentContext): Promise<AgentResult> {
    const input = task.input ?? {};
    const topics = (input.topics as string[] | undefined) ?? DEFAULT_TOPICS;
    const perTopic = (input.perTopic as number | undefined) ?? 5;
    const sinceDays = (input.sinceDays as number | undefined) ?? 14;
    const limit = (input.limit as number | undefined) ?? 10;

    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const byFullName = new Map<string, TrendingRepo>();
    let anyRequestSucceeded = false;

    for (const topic of topics) {
      const query = `topic:${topic} pushed:>${since}`;
      const url = `${GITHUB_SEARCH_URL}?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${perTopic}`;
      try {
        const res = await fetch(url, { headers: { accept: "application/vnd.github+json", "user-agent": "AshOS" } });
        if (!res.ok) continue;
        anyRequestSucceeded = true;
        const body = (await res.json()) as { items?: GitHubSearchItem[] };
        for (const item of body.items ?? []) {
          if (byFullName.has(item.full_name)) continue;
          byFullName.set(item.full_name, {
            fullName: item.full_name,
            url: item.html_url,
            description: item.description,
            stars: item.stargazers_count,
            forks: item.forks_count,
            language: item.language,
            topics: item.topics ?? [],
            pushedAt: item.pushed_at
          });
        }
      } catch {
        continue;
      }
    }

    if (!anyRequestSucceeded) {
      return { ok: false, error: "GitHub Search API unreachable (network blocked or rate-limited) — no trending repos fetched" };
    }

    const repos = [...byFullName.values()].sort((a, b) => b.stars - a.stars).slice(0, limit);
    const output = repos.length
      ? repos
          .map((r, i) => `${i + 1}. ${r.fullName} (${r.stars}★, ${r.language ?? "n/a"}) — ${r.description ?? "no description"}`)
          .join("\n")
      : "No repositories matched the given topics in the selected time window.";

    return { ok: true, output, data: { repos, sinceDays, topics } };
  }
}
