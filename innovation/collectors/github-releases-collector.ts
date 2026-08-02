import type { Signal } from "../types";
import type { Collector } from "./types";

interface GitHubSearchItem {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  topics?: string[];
  pushed_at: string;
}

const GITHUB_SEARCH_URL = "https://api.github.com/search/repositories";
const DEFAULT_TOPICS = ["ai", "artificial-intelligence", "llm", "ai-agents", "developer-tools"];

export interface GithubReleasesCollectorOptions {
  topics?: string[];
  perTopic?: number;
  sinceDays?: number;
}

/**
 * Real, network-backed collector for the "github" domain — the extension
 * point `mock-collector.ts` documents ("swap in a network-backed collector
 * via CollectorRegistry.register"). Queries the public GitHub Search API
 * directly (same verified pattern as `agents/github-trending-agent.ts`) for
 * repositories tagged with a relevant topic that were pushed to recently,
 * turning each into a `repository` signal.
 *
 * Registered on the `CollectorRegistry` under a distinct id (`github-live`,
 * not `mock-github`) so it never silently replaces the deterministic
 * default — `InnovationModule` only runs it when a discovery cycle is
 * explicitly asked to include live sources (`runDiscoveryCycle(domains,
 * { includeLive: true })`), keeping `ash innovation discover`'s default
 * behavior and the test suite fully offline unless a caller opts in.
 */
export function createGithubReleasesCollector(options: GithubReleasesCollectorOptions = {}): Collector {
  const topics = options.topics ?? DEFAULT_TOPICS;
  const perTopic = options.perTopic ?? 5;
  const sinceDays = options.sinceDays ?? 7;

  return {
    id: "github-live",
    domain: "github",
    description: "Real GitHub Search API collector: repositories tagged with an AI/developer-tools topic, pushed to recently.",
    async collect(): Promise<Signal[]> {
      const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const observedAt = new Date().toISOString();
      const byFullName = new Map<string, Signal>();

      for (const topic of topics) {
        const query = `topic:${topic} pushed:>${since}`;
        const url = `${GITHUB_SEARCH_URL}?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${perTopic}`;
        try {
          const res = await fetch(url, { headers: { accept: "application/vnd.github+json", "user-agent": "AshOS" } });
          if (!res.ok) continue;
          const body = (await res.json()) as { items?: GitHubSearchItem[] };
          for (const item of body.items ?? []) {
            if (byFullName.has(item.full_name)) continue;
            byFullName.set(item.full_name, {
              id: `github-live-${item.full_name}`,
              domain: "github",
              kind: "repository",
              source: "github:search-api",
              title: item.full_name,
              summary: item.description ?? `A ${item.language ?? "repository"} project trending under topic "${topic}".`,
              url: item.html_url,
              tags: [...new Set([item.language?.toLowerCase(), ...(item.topics ?? [])].filter((t): t is string => Boolean(t)))],
              confidence: Math.min(0.95, 0.5 + item.stargazers_count / 100_000),
              observedAt,
              raw: item
            });
          }
        } catch {
          continue;
        }
      }

      return [...byFullName.values()];
    }
  };
}
