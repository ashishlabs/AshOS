export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface FunctionDefinition {
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
}

export interface FunctionCallRequest {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  functions?: FunctionDefinition[];
}

export interface ChatResult {
  content: string;
  functionCall?: FunctionCallRequest;
  raw?: unknown;
}

export interface StreamChunk {
  delta: string;
  done: boolean;
}

/**
 * Common contract every AI backend must satisfy. Swapping providers should
 * only require changing one configuration value (ASHOS_PROVIDER / .ashos
 * config), never touching planner/agent code.
 */
export interface AIProvider {
  name(): string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
  stream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<StreamChunk>;
  embeddings(text: string): Promise<number[]>;
  functionCalling(): boolean;
  maxContext(): number;
  supportsVision(): boolean;
}
