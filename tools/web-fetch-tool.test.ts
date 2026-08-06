import zlib from "node:zlib";
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

function imageResponse(buffer: Buffer, opts: { status?: number; contentType?: string; contentLength?: string } = {}) {
  const headers = new Map<string, string>();
  headers.set("content-type", opts.contentType ?? "image/png");
  if (opts.contentLength) headers.set("content-length", opts.contentLength);
  return {
    ok: (opts.status ?? 200) < 400,
    status: opts.status ?? 200,
    headers: { get: (key: string) => headers.get(key.toLowerCase()) ?? null },
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    text: async () => buffer.toString("binary")
  };
}

const TEST_IMAGE_FONT: Record<string, string[]> = {
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"]
};

function pngCrc32(buf: Buffer): number {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(pngCrc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * Hand-builds a grayscale PNG rendering `text` in a blocky 5x7 bitmap font —
 * only letters in `TEST_IMAGE_FONT` are supported. Deliberately picked
 * OCR-friendly parameters (scale/padding) empirically verified against
 * real `tesseract.js` recognition before writing these tests, same
 * "prove the extraction approach works first" discipline as the PDF fixture.
 */
function buildTestImage(text: string, scale = 20, padding = 60): Buffer {
  const charW = 5;
  const charH = 7;
  const gap = 1;
  const width = text.length * (charW + gap) * scale + padding * 2;
  const height = charH * scale + padding * 2;
  const pixels: number[][] = Array.from({ length: height }, () => new Array(width).fill(255));

  for (let ci = 0; ci < text.length; ci++) {
    const glyph = TEST_IMAGE_FONT[text[ci]];
    if (!glyph) continue;
    for (let row = 0; row < charH; row++) {
      for (let col = 0; col < charW; col++) {
        if (glyph[row][col] !== "1") continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            pixels[padding + row * scale + sy][padding + ci * (charW + gap) * scale + col * scale + sx] = 0;
          }
        }
      }
    }
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // color type: grayscale

  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0; // filter type: none
    for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = pixels[y][x];
  }
  const idatData = zlib.deflateSync(raw);

  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idatData), pngChunk("IEND", Buffer.alloc(0))]);
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

  it("rejects a non-text, non-PDF, non-image content-type instead of trying to parse binary content", async () => {
    const tool = new WebFetchTool({ resolveHostname: PUBLIC_IP });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse("binary garbage", { contentType: "video/mp4" })));
    const result = await tool.execute({ action: "fetch", args: { url: "https://example.com/file.mp4" } });
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

  it("OCRs real text out of an image response (image/png content-type)", async () => {
    const tool = new WebFetchTool({ resolveHostname: PUBLIC_IP });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(imageResponse(buildTestImage("TITLE"))));
    const result = await tool.execute({ action: "fetch", args: { url: "https://example.com/screenshot" } });
    expect(result.ok).toBe(true);
    expect(result.output).toContain("TITLE");
  }, 20000);

  it("OCRs an image detected by a .png URL suffix with no content-type header", async () => {
    const tool = new WebFetchTool({ resolveHostname: PUBLIC_IP });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(imageResponse(buildTestImage("TITLE"), { contentType: "" })));
    const result = await tool.execute({ action: "fetch", args: { url: "https://example.com/screenshot.png" } });
    expect(result.ok).toBe(true);
    expect(result.output).toContain("TITLE");
  }, 20000);

  it("OCRs an image when a host serves it as application/octet-stream", async () => {
    const tool = new WebFetchTool({ resolveHostname: PUBLIC_IP });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(imageResponse(buildTestImage("TITLE"), { contentType: "application/octet-stream" }))
    );
    const result = await tool.execute({ action: "fetch", args: { url: "https://raw.githubusercontent.com/org/repo/main/shot.png" } });
    expect(result.ok).toBe(true);
    expect(result.output).toContain("TITLE");
  }, 20000);

  it("returns a clear error for a corrupt/unreadable image instead of crashing the process", async () => {
    const tool = new WebFetchTool({ resolveHostname: PUBLIC_IP });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(imageResponse(Buffer.from("not actually an image"))));
    const result = await tool.execute({ action: "fetch", args: { url: "https://example.com/broken.png" } });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/failed to parse image/);
  }, 20000);

  it("rejects an oversized image body even without a declared content-length", async () => {
    const tool = new WebFetchTool({ resolveHostname: PUBLIC_IP });
    const oversized = Buffer.concat([buildTestImage("TITLE"), Buffer.alloc(2_000_001)]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(imageResponse(oversized)));
    const result = await tool.execute({ action: "fetch", args: { url: "https://example.com/huge.png" } });
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
