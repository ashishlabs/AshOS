import type { AIProvider, ChatMessage, ChatOptions, ChatResult, StreamChunk } from "./types";

export interface LMStudioProviderOptions {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

/**
 * Talks to a local LM Studio server, which exposes an OpenAI-compatible
 * Chat Completions API (LM Studio's own docs recommend
 * OPENAI_BASE_URL=http://localhost:1234/v1, OPENAI_API_KEY=lm-studio).
 * Kept as its own named provider (rather than just reusing OpenAIProvider
 * with a custom baseUrl) so `ash provider list`/config surface "lmstudio"
 * distinctly and so the Evolution Engine's `researchProvider: "lmstudio"`
 * config reads naturally — but the wire protocol is identical to OpenAI's,
 * and the model name is never hardcoded: it's whatever `model` resolves to
 * from config, e.g. "google/gemma-4-12b-qat".
 */
export class LMStudioProvider implements AIProvider {
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor(opts: LMStudioProviderOptions = {}) {
    this.baseUrl = opts.baseUrl ?? "http://localhost:1234/v1";
    this.apiKey = opts.apiKey ?? "lm-studio";
    this.model = opts.model ?? "";
  }

  name(): string {
    return "lmstudio";
  }

  private headers(): Record<string, string> {
    return { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` };
  }

  private resolveModel(options?: ChatOptions): string {
    const model = options?.model ?? this.model;
    if (!model) {
      throw new Error(
        "LMStudioProvider: no model configured. Set providers.lmstudio.model in .ashos/config.json (e.g. \"google/gemma-4-12b-qat\") to whatever model is loaded in LM Studio."
      );
    }
    return model;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: this.resolveModel(options),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        messages
      })
    });

    if (!res.ok) {
      throw new Error(`LMStudioProvider: request failed (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as { choices: { message: { content: string | null } }[] };
    return { content: data.choices[0]?.message?.content ?? "", raw: data };
  }

  async *stream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<StreamChunk> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ model: this.resolveModel(options), messages, stream: true })
    });
    if (!res.ok || !res.body) {
      throw new Error(`LMStudioProvider: stream failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.replace(/^data:\s*/, "").trim();
        if (!trimmed || trimmed === "[DONE]") continue;
        const chunk = JSON.parse(trimmed) as { choices: { delta?: { content?: string }; finish_reason?: string | null }[] };
        const delta = chunk.choices[0]?.delta?.content ?? "";
        const finished = Boolean(chunk.choices[0]?.finish_reason);
        if (delta) yield { delta, done: false };
        if (finished) yield { delta: "", done: true };
      }
    }
  }

  async embeddings(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ model: this.model || "text-embedding-nomic-embed-text-v1.5", input: text })
    });
    if (!res.ok) {
      throw new Error(
        `LMStudioProvider: embeddings failed (${res.status}). Make sure an embedding model is loaded in LM Studio: ${await res.text()}`
      );
    }
    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return data.data[0]?.embedding ?? [];
  }

  functionCalling(): boolean {
    return false;
  }

  maxContext(): number {
    return 8192;
  }

  supportsVision(): boolean {
    return false;
  }
}
