import type { InboxClassification } from "./types";

const URL_RE = /https?:\/\/\S+/i;
const GITHUB_RE = /^https?:\/\/(www\.)?github\.com\/[^/\s]+\/[^/\s]+/i;
const YOUTUBE_RE = /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/)/i;
const TWEET_RE = /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/[^/\s]+\/status\/\d+/i;
const PDF_RE = /\.pdf(\?\S*)?$/i;
const IMAGE_RE = /\.(png|jpe?g|gif|bmp|webp)(\?\S*)?$/i;

/**
 * Deterministic, offline content classification — same "mock/deterministic
 * by default" convention as the rest of the codebase (providers, Innovation
 * collectors). No LLM call, so capture never blocks on network/provider
 * availability.
 */
export function classify(content: string): InboxClassification {
  const trimmed = content.trim();
  const detectedUrl = trimmed.match(URL_RE)?.[0];

  if (!detectedUrl) return { sourceType: "text", tags: [] };
  if (GITHUB_RE.test(detectedUrl)) return { sourceType: "github-repo", tags: ["github"], detectedUrl };
  if (YOUTUBE_RE.test(detectedUrl)) return { sourceType: "youtube", tags: ["video"], detectedUrl };
  if (TWEET_RE.test(detectedUrl)) return { sourceType: "tweet", tags: ["social"], detectedUrl };
  if (PDF_RE.test(detectedUrl)) return { sourceType: "pdf", tags: ["document"], detectedUrl };
  if (IMAGE_RE.test(detectedUrl)) return { sourceType: "image", tags: ["image"], detectedUrl };
  return { sourceType: "article", tags: ["link"], detectedUrl };
}
