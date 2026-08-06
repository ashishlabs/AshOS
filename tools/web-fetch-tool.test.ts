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

function pdfResponse(buffer: Buffer, opts: { status?: number; contentType?: string; contentLength?: string } = {}) {
  const headers = new Map<string, string>();
  headers.set("content-type", opts.contentType ?? "application/pdf");
  if (opts.contentLength) headers.set("content-length", opts.contentLength);
  return {
    ok: (opts.status ?? 200) < 400,
    status: opts.status ?? 200,
    headers: { get: (key: string) => headers.get(key.toLowerCase()) ?? null },
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    text: async () => buffer.toString("binary")
  };
}

/** Hand-builds a minimal single-page PDF containing `text`, with no external font/image dependencies. */
function buildTestPdf(text: string): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 2000 200] /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  const streamContent = `BT /F1 24 Tf 20 100 Td (${text}) Tj ET`;
  const streamObj = `<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  offsets.push(pdf.length);
  pdf += `5 0 obj\n${streamObj}\nendobj\n`;

  const xrefStart = pdf.length;
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += xref;
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "binary");
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

  it("rejects a non-text, non-PDF content-type instead of trying to parse binary content", async () => {
    const tool = new WebFetchTool({ resolveHostname: PUBLIC_IP });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse("binary garbage", { contentType: "image/png" })));
    const result = await tool.execute({ action: "fetch", args: { url: "https://example.com/file.png" } });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unsupported content-type/);
  });

  it("extracts real text from a PDF response (application/pdf content-type)", async () => {
    const tool = new WebFetchTool({ resolveHostname: PUBLIC_IP });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pdfResponse(buildTestPdf("Hello PDF World"))));
    const result = await tool.execute({ action: "fetch", args: { url: "https://example.com/doc" } });
    expect(result.ok).toBe(true);
    expect(result.output).toContain("Hello PDF World");
  });

  it("extracts PDF text when detected by a .pdf URL suffix with no content-type header", async () => {
    const tool = new WebFetchTool({ resolveHostname: PUBLIC_IP });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pdfResponse(buildTestPdf("Suffix Detected"), { contentType: "" })));
    const result = await tool.execute({ action: "fetch", args: { url: "https://example.com/report.pdf" } });
    expect(result.ok).toBe(true);
    expect(result.output).toContain("Suffix Detected");
  });

  it("extracts PDF text when a host serves it as application/octet-stream (e.g. raw.githubusercontent.com)", async () => {
    const tool = new WebFetchTool({ resolveHostname: PUBLIC_IP });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(pdfResponse(buildTestPdf("Octet Stream Detected"), { contentType: "application/octet-stream" }))
    );
    const result = await tool.execute({ action: "fetch", args: { url: "https://raw.githubusercontent.com/org/repo/main/doc.pdf" } });
    expect(result.ok).toBe(true);
    expect(result.output).toContain("Octet Stream Detected");
  });

  it("returns a clear error for a corrupt/malformed PDF instead of throwing", async () => {
    const tool = new WebFetchTool({ resolveHostname: PUBLIC_IP });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pdfResponse(Buffer.from("not actually a pdf"))));
    const result = await tool.execute({ action: "fetch", args: { url: "https://example.com/broken.pdf" } });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/failed to parse PDF/);
  });

  it("rejects an oversized PDF body even without a declared content-length", async () => {
    const tool = new WebFetchTool({ resolveHostname: PUBLIC_IP });
    const oversized = Buffer.concat([buildTestPdf("big"), Buffer.alloc(2_000_001)]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pdfResponse(oversized)));
    const result = await tool.execute({ action: "fetch", args: { url: "https://example.com/huge.pdf" } });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too large/);
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
