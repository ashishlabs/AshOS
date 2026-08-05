import net from "node:net";
import type { Tool, ToolCapabilities, ToolExecuteRequest, ToolExecuteResult, ToolHealth, ToolRequirements } from "./types";

const DEFAULT_TIMEOUT_MS = 6000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_TEXT_LENGTH = 4000;

const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0"]);

function isPrivateOrLoopbackIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local, includes cloud metadata endpoints
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd");
  }
  return false;
}

async function defaultResolveHostname(hostname: string): Promise<string> {
  const { lookup } = await import("node:dns/promises");
  const { address } = await lookup(hostname);
  return address;
}

function stripHtml(html: string): { title?: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return { title: titleMatch?.[1]?.replace(/\s+/g, " ").trim(), text };
}

export interface WebFetchToolOptions {
  /** Injectable for tests; defaults to real DNS resolution via `node:dns/promises`. */
  resolveHostname?: (hostname: string) => Promise<string>;
  timeoutMs?: number;
}

/**
 * Fetches a URL and extracts its readable text (HTML tags stripped) so a
 * caller — today, the Inbox's AI summarizer (`inbox/inbox-manager.ts`) —
 * can ground a summary in what a captured link actually says instead of
 * just its URL string. Also closes part of North Star goal #8 (Autonomous
 * Research): any agent can call this via `context.tools.get("web-fetch")`.
 *
 * Deliberately conservative for a tool that can run against arbitrary
 * user-supplied URLs with no per-call approval gate (unlike Shell/Git,
 * which route through `PermissionManager`): only `http`/`https`, private/
 * loopback/link-local addresses blocked after DNS resolution (blocks the
 * common cloud metadata IP too), redirects refused rather than followed,
 * a hard timeout, and a capped read size. This is a read-only best-effort
 * enrichment, not a general-purpose browser — binary/non-text responses
 * are rejected by content-type rather than parsed.
 */
export class WebFetchTool implements Tool {
  private resolveHostname: (hostname: string) => Promise<string>;
  private timeoutMs: number;

  constructor(opts: WebFetchToolOptions = {}) {
    this.resolveHostname = opts.resolveHostname ?? defaultResolveHostname;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  capabilities(): ToolCapabilities {
    return { name: "web-fetch", description: "Fetch a URL and extract its readable text content", actions: ["fetch"] };
  }

  requirements(): ToolRequirements {
    return {};
  }

  permissions(): { dangerous: boolean } {
    return { dangerous: false };
  }

  async healthCheck(): Promise<ToolHealth> {
    return { healthy: true };
  }

  async execute(request: ToolExecuteRequest): Promise<ToolExecuteResult> {
    const rawUrl = String(request.args?.url ?? "");
    if (!rawUrl) return { ok: false, error: "missing 'url' argument" };

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return { ok: false, error: `invalid URL: ${rawUrl}` };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: `unsupported protocol: ${parsed.protocol}` };
    }
    if (BLOCKED_HOSTNAMES.has(parsed.hostname.toLowerCase())) {
      return { ok: false, error: `refusing to fetch a blocked host: ${parsed.hostname}` };
    }

    try {
      const address = await this.resolveHostname(parsed.hostname);
      if (isPrivateOrLoopbackIp(address)) {
        return { ok: false, error: `refusing to fetch a private/internal address: ${parsed.hostname} -> ${address}` };
      }
    } catch (error) {
      return { ok: false, error: `could not resolve host: ${(error as Error).message}` };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(parsed.toString(), { signal: controller.signal, redirect: "manual" });
      if (res.status >= 300 && res.status < 400) {
        return { ok: false, error: `refusing to follow a redirect (status ${res.status})` };
      }
      if (!res.ok) {
        return { ok: false, error: `request failed (${res.status})` };
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (contentType && !/text\/html|text\/plain|application\/xhtml/i.test(contentType)) {
        return { ok: false, error: `unsupported content-type: ${contentType}` };
      }
      const contentLength = Number(res.headers.get("content-length") ?? 0);
      if (contentLength > MAX_RESPONSE_BYTES) {
        return { ok: false, error: `response too large (${contentLength} bytes)` };
      }

      const raw = (await res.text()).slice(0, MAX_RESPONSE_BYTES);
      const { title, text } = stripHtml(raw);
      if (!text) return { ok: false, error: "no readable text content found" };
      const truncated = text.slice(0, MAX_TEXT_LENGTH);
      return { ok: true, output: title ? `${title}\n\n${truncated}` : truncated };
    } catch (error) {
      const err = error as Error;
      return { ok: false, error: err.name === "AbortError" ? `request timed out after ${this.timeoutMs}ms` : err.message };
    } finally {
      clearTimeout(timeout);
    }
  }
}
