import type { AIProvider, ChatMessage, ChatOptions, ChatResult, StreamChunk } from "./types";

export interface OllamaProviderOptions {
  baseUrl?: string;
  model?: string;
}

/** Talks to a local Ollama (or LM Studio, which shares a similar API) server. */
export class OllamaProvider implements AIProvider {
  private baseUrl: string;
  private model: string;

  constructor(opts: OllamaProviderOptions = {}) {
    this.baseUrl = opts.baseUrl ?? "http://localhost:11434";
    this.model = opts.model ?? "llama3.1";
  }

  name(): string {
    return "ollama";
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: options?.model ?? this.model,
        messages,
        stream: false,
        options: { temperature: options?.temperature }
      })
    });

    if (!res.ok) {
      throw new Error(`OllamaProvider: request failed (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as { message: { content: string } };
    return { content: data.message?.content ?? "", raw: data };
  }

  async *stream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<StreamChunk> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: options?.model ?? this.model, messages, stream: true })
    });
    if (!res.ok || !res.body) {
      throw new Error(`OllamaProvider: stream failed (${res.status})`);
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
        if (!line.trim()) continue;
        const chunk = JSON.parse(line) as { message?: { content: string }; done: boolean };
        yield { delta: chunk.message?.content ?? "", done: chunk.done };
      }
    }
    yield { delta: "", done: true };
  }

  async embeddings(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, prompt: text })
    });
    if (!res.ok) {
      throw new Error(`OllamaProvider: embeddings failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as { embedding: number[] };
    return data.embedding ?? [];
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
