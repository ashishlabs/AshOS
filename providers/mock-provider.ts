import type { AIProvider, ChatMessage, ChatOptions, ChatResult, StreamChunk } from "./types";

function hashToVector(text: string, dims = 32): number[] {
  const vec = new Array(dims).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[i % dims] += text.charCodeAt(i) / 255;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

/**
 * Deterministic, offline provider. Used as the default provider (so
 * `ash init` works with zero API keys), in unit/integration tests, and as a
 * reference implementation for anyone writing a new provider plugin.
 */
export class MockProvider implements AIProvider {
  name(): string {
    return "mock";
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const content = `[mock:${options?.model ?? "default"}] echo: ${lastUser?.content ?? ""}`.trim();
    return { content, raw: { messages, options } };
  }

  async *stream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<StreamChunk> {
    const { content } = await this.chat(messages, options);
    const words = content.split(" ");
    for (const word of words) {
      yield { delta: `${word} `, done: false };
    }
    yield { delta: "", done: true };
  }

  async embeddings(text: string): Promise<number[]> {
    return hashToVector(text);
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
