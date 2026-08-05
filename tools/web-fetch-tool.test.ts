import { afterEach, describe, expect, it, vi } from "vitest";
import { WebFetchTool } from "./web-fetch-tool";

function htmlResponse(html: string, opts: { status?: number; contentType?: string; contentLength?: string } = {}) {
  const headers = new Map<string, string>();
  headers.set("content-type", opts.contentType ?? "text/html; charset=utf-8");
  if (opts.contentLength) headers.set("content-length", opts.contentLength);
  return {
    ok: (opts.status ?? 200) < 400,
    status: opts.status ?? 200,
    headers: { get: (key: string) => headers.get(key.toLowerCase()) ?? null },
    text: async () => html
  };
}

const PUBLIC_IP = async () => "93.184.216.34"; // example.com's real (public) IP — a stand-in resolver for tests

describe("WebFetchTool", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches a URL and extracts readable text, stripping tags/scripts/styles", async () => {
    const tool = new WebFetchTool({ resolveHostname: PUBLIC_IP });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        htmlResponse(`
          <html><head><title>Example Page</title><style>body{color:red}</style></head>
          <body><script>alert('x')</script><h1>Hello</h1><p>Some real content here.</p></body></html>
        `)
      )
    );

    const result = await tool.execute({ action: "fetch", args: { url: "https://example.com/article" } });

    expect(result.ok).toBe(true);
    expect(result.output).toContain("Example Page");
    expect(result.output).toContain("Hello");
    expect(result.output).toContain("Some real content here.");
    expect(result.output).not.toContain("alert(");
    expect(result.output).not.toContain("color:red");
  });

  it("rejects a non-http(s) protocol", async () => {
    const tool = new WebFetchTool({ resolveHostname: PUBLIC_IP });
    const result = await tool.execute({ action: "fetch", args: { url: "file:///etc/passwd" } });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unsupported protocol/);
  });

  it("refuses an invalid URL instead of throwing", async () => {
    const tool = new WebFetchTool({ resolveHostname: PUBLIC_IP });
    const result = await tool.execute({ action: "fetch", args: { url: "not a url" } });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid URL/);
  });

  it("requires a 'url' argument", async () => {
    const tool = new WebFetchTool({ resolveHostname: PUBLIC_IP });
    const result = await tool.execute({ action: "fetch", args: {} });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/missing 'url'/);
  });

  it("blocks the literal 'localhost' hostname without even attempting DNS resolution", async () => {
    const resolveHostname = vi.fn();
    const tool = new WebFetchTool({ resolveHostname });
    const result = await tool.execute({ action: "fetch", args: { url: "http://localhost:4700/inbox" } });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/blocked host/);
    expect(resolveHostname).not.toHaveBeenCalled();
  });

  it("blocks a hostname that resolves to a loopback address", async () => {
    const tool = new WebFetchTool({ resolveHostname: async () => "127.0.0.1" });
    const result = await tool.execute({ action: "fetch", args: { url: "http://sneaky.example.com/" } });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/private\/internal address/);
  });

  it("blocks a hostname that resolves to the cloud metadata link-local address", async () => {
    const tool = new WebFetchTool({ resolveHostname: async () => "169.254.169.254" });
    const result = await tool.execute({ action: "fetch", args: { url: "http://sneaky.example.com/" } });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/private\/internal address/);
  });

  it("blocks a hostname that resolves to a private (RFC1918) address", async () => {
    const tool = new WebFetchTool({ resolveHostname: async () => "10.0.0.5" });
    const result = await tool.execute({ action: "fetch", args: { url: "http://sneaky.example.com/" } });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/private\/internal address/);
  });

  it("allows a hostname that resolves to a public address", async () => {
    const tool = new WebFetchTool({ resolveHostname: async () => "93.184.216.34" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse("<p>public content</p>")));
    const result = await tool.execute({ action: "fetch", args: { url: "http://example.com/" } });
    expect(result.ok).toBe(true);
  });

  it("refuses to follow a redirect", async () => {
    const tool = new WebFetchTool({ resolveHostname: PUBLIC_IP });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 302, headers: { get: () => null }, text: async () => "" }));
    const result = await tool.execute({ action: "fetch", args: { url: "https://example.com/redirects" } });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/refusing to follow a redirect/);
  });

  it("rejects a non-2xx response", async () => {
    const tool = new WebFetchTool({ resolveHostname: PUBLIC_IP });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, headers: { get: () => null }, text: async () => "" }));
    const result = await tool.execute({ action: "fetch", args: { url: "https://example.com/missing" } });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/404/);
  });

  it("rejects a non-text content-type instead of trying to parse binary content", async () => {
    const tool = new WebFetchTool({ resolveHostname: PUBLIC_IP });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse("binary garbage", { contentType: "application/pdf" })));
    const result = await tool.execute({ action: "fetch", args: { url: "https://example.com/file.pdf" } });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unsupported content-type/);
  });

  it("rejects a response whose declared content-length exceeds the cap", async () => {
    const tool = new WebFetchTool({ resolveHostname: PUBLIC_IP });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse("<p>huge</p>", { contentLength: String(50_000_000) })));
    const result = await tool.execute({ action: "fetch", args: { url: "https://example.com/huge" } });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too large/);
  });

  it("truncates very long extracted text", async () => {
    const tool = new WebFetchTool({ resolveHostname: PUBLIC_IP });
    const longText = "word ".repeat(2000);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse(`<p>${longText}</p>`)));
    const result = await tool.execute({ action: "fetch", args: { url: "https://example.com/long" } });
    expect(result.ok).toBe(true);
    expect(result.output!.length).toBeLessThanOrEqual(4000 + 50); // + a little slack for a title line
  });

  it("surfaces a clear error when the request times out", async () => {
    const tool = new WebFetchTool({ resolveHostname: PUBLIC_IP, timeoutMs: 10 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, opts: { signal: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        });
      })
    );
    const result = await tool.execute({ action: "fetch", args: { url: "https://example.com/slow" } });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/timed out/);
  });

  it("declares itself non-dangerous and always healthy", async () => {
    const tool = new WebFetchTool();
    expect(tool.permissions().dangerous).toBe(false);
    expect((await tool.healthCheck()).healthy).toBe(true);
    expect(tool.capabilities().name).toBe("web-fetch");
  });
});
