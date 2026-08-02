import type { Signal } from "../types";
import type { Collector } from "./types";

interface RedditPost {
  id: string;
  title: string;
  url: string;
  permalink: string;
  ups: number;
  num_comments: number;
  selftext?: string;
  created_utc: number;
}

interface RedditListing {
  data?: { children?: { data: RedditPost }[] };
}

const DEFAULT_SUBREDDITS = ["MachineLearning", "artificial", "LocalLLaMA"];

export interface RedditCollectorOptions {
  subreddits?: string[];
  perSubreddit?: number;
}

/**
 * Real, network-backed collector for Reddit's public JSON listing endpoints
 * (no OAuth needed for read-only top-of-day). Same opt-in convention as
 * `github-releases-collector.ts` — never registered on `CollectorRegistry`,
 * only reachable via `InnovationModule.runLiveDiscovery()`. Reddit requires
 * a descriptive User-Agent or it responds 429, so one is always sent.
 */
export function createRedditCollector(options: RedditCollectorOptions = {}): Collector {
  const subreddits = options.subreddits ?? DEFAULT_SUBREDDITS;
  const perSubreddit = options.perSubreddit ?? 5;

  return {
    id: "reddit-live",
    domain: "community",
    description: "Real Reddit (public JSON API) collector: today's top posts from AI-focused subreddits.",
    async collect(): Promise<Signal[]> {
      const observedAt = new Date().toISOString();
      const byId = new Map<string, Signal>();

      for (const subreddit of subreddits) {
        const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/top.json?limit=${perSubreddit}&t=day`;
        try {
          const res = await fetch(url, { headers: { "user-agent": "AshOS:innovation-intelligence:v1" } });
          if (!res.ok) continue;
          const body = (await res.json()) as RedditListing;
          for (const child of body.data?.children ?? []) {
            const post = child.data;
            if (!post?.title || byId.has(post.id)) continue;
            byId.set(post.id, {
              id: `reddit-live-${post.id}`,
              domain: "community",
              kind: "discussion",
              source: `reddit:r/${subreddit}`,
              title: post.title,
              summary: post.selftext?.slice(0, 280) || `${post.ups} upvote(s), ${post.num_comments} comment(s) in r/${subreddit}.`,
              url: post.url?.startsWith("http") ? post.url : `https://reddit.com${post.permalink}`,
              tags: [subreddit.toLowerCase()],
              confidence: Math.min(0.9, 0.4 + post.ups / 5000),
              observedAt,
              raw: post
            });
          }
        } catch {
          continue;
        }
      }

      return [...byId.values()];
    }
  };
}
