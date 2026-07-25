import type { AIProvider, ChatMessage, ChatOptions, ChatResult, StreamChunk } from "./types";

export interface AnthropicProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

/**
 * Talks to the Anthropic Messages API directly over fetch (no SDK
 * dependency) so the provider layer stays lightweight and easy to audit.
 */
export class AnthropicProvider implements AIProvider {
  private model: string;
  private baseUrl: string;

  constructor(private opts: AnthropicProviderOptions) {
    this.model = opts.model ?? "claude-sonnet-4-5";
    this.baseUrl = opts.baseUrl ?? "https://api.anthropic.com/v1";
  }

  name(): string {
    return "anthropic";
  }

  private splitSystem(messages: ChatMessage[]): { system?: string; rest: ChatMessage[] } {
    const system = messages.find((m) => m.role === "system")?.content;
    const rest = messages.filter((m) => m.role !== "system");
    return { system, rest };
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    if (!this.opts.apiKey) {
      throw new Error("AnthropicProvider: missing API key (set ANTHROPIC_API_KEY)");
    }
    const { system, rest } = this.splitSystem(messages);

    const res = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.opts.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: options?.model ?? this.model,
        system,
        max_tokens: options?.maxTokens ?? 2048,
        temperature: options?.temperature,
        messages: rest.map((m) => ({ role: m.role, content: m.content }))
      })
    });

    if (!res.ok) {
      throw new Error(`AnthropicProvider: request failed (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as { content: { type: string; text?: string }[] };
    const content = data.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");
    return { content, raw: data };
  }

  async *stream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<StreamChunk> {
    const result = await this.chat(messages, options);
    yield { delta: result.content, done: false };
    yield { delta: "", done: true };
  }

  async embeddings(): Promise<number[]> {
    throw new Error("AnthropicProvider does not expose an embeddings endpoint; use a dedicated embeddings provider");
  }

  functionCalling(): boolean {
    return true;
  }

  maxContext(): number {
    return 200_000;
  }

  supportsVision(): boolean {
    return true;
  }
}
