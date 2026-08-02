import { describe, expect, it, vi, afterEach } from "vitest";
import { LMStudioProvider } from "./lmstudio-provider";

describe("LMStudioProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to the local LM Studio endpoint and lm-studio placeholder key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "hi from qwen" } }] })
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new LMStudioProvider({ model: "qwen/qwen2.5-coder-14b" });
    const result = await provider.chat([{ role: "user", content: "hello" }]);

    expect(result.content).toBe("hi from qwen");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:1234/v1/chat/completions",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer lm-studio" }) })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("qwen/qwen2.5-coder-14b");
  });

  it("never hardcodes a model name — throws a clear error when none is configured", async () => {
    const provider = new LMStudioProvider();
    await expect(provider.chat([{ role: "user", content: "hi" }])).rejects.toThrow(/no model configured/i);
  });

  it("lets a per-call option override the configured model", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }] }) });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new LMStudioProvider({ model: "default-model" });
    await provider.chat([{ role: "user", content: "hi" }], { model: "override-model" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("override-model");
  });

  it("surfaces a clear error when the endpoint is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "internal error" })
    );
    const provider = new LMStudioProvider({ model: "qwen/qwen2.5-coder-14b" });
    await expect(provider.chat([{ role: "user", content: "hi" }])).rejects.toThrow(/request failed \(500\)/);
  });

  it("declares realistic capability flags for a local model", () => {
    const provider = new LMStudioProvider();
    expect(provider.name()).toBe("lmstudio");
    expect(provider.functionCalling()).toBe(false);
    expect(provider.supportsVision()).toBe(false);
    expect(provider.maxContext()).toBeGreaterThan(0);
  });
});
