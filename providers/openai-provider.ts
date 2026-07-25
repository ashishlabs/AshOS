import type { AIProvider, ChatMessage, ChatOptions, ChatResult, StreamChunk } from "./types";

export interface OpenAIProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

/** Talks to the OpenAI-compatible Chat Completions + Embeddings API over fetch. */
export class OpenAIProvider implements AIProvider {
  private model: string;
  private baseUrl: string;

  constructor(private opts: OpenAIProviderOptions) {
    this.model = opts.model ?? "gpt-4o-mini";
    this.baseUrl = opts.baseUrl ?? "https://api.openai.com/v1";
  }

  name(): string {
    return "openai";
  }

  private headers(): Record<string, string> {
    if (!this.opts.apiKey) {
      throw new Error("OpenAIProvider: missing API key (set OPENAI_API_KEY)");
    }
    return { "content-type": "application/json", authorization: `Bearer ${this.opts.apiKey}` };
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: options?.model ?? this.model,
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        messages,
        functions: options?.functions
      })
    });

    if (!res.ok) {
      throw new Error(`OpenAIProvider: request failed (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as {
      choices: { message: { content: string | null; function_call?: { name: string; arguments: string } } }[];
    };
    const message = data.choices[0]?.message;
    return {
      content: message?.content ?? "",
      functionCall: message?.function_call
        ? { name: message.function_call.name, arguments: JSON.parse(message.function_call.arguments || "{}") }
        : undefined,
      raw: data
    };
  }

  async *stream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<StreamChunk> {
    const result = await this.chat(messages, options);
    yield { delta: result.content, done: false };
    yield { delta: "", done: true };
  }

  async embeddings(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ model: "text-embedding-3-small", input: text })
    });
    if (!res.ok) {
      throw new Error(`OpenAIProvider: embeddings failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return data.data[0]?.embedding ?? [];
  }

  functionCalling(): boolean {
    return true;
  }

  maxContext(): number {
    return 128_000;
  }

  supportsVision(): boolean {
    return true;
  }
}
