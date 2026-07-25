const BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

export interface Health {
  ok: boolean;
  provider: string;
}
export interface AgentInfo {
  name: string;
  description: string;
  capabilities: string[];
}
export interface ProvidersInfo {
  active: string;
  available: string[];
}
export interface ToolInfo {
  name: string;
  description: string;
  actions: string[];
}
export interface PlannedTask {
  id: string;
  title: string;
  description: string;
  capability: string;
  dependsOn?: string[];
}
export interface TaskGraph {
  goal: string;
  tasks: PlannedTask[];
}
export interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  timestamp: string;
}
export interface AshOSEvent {
  name: string;
  timestamp: string;
  payload: unknown;
}
export interface MemoryRecord {
  id: string;
  scope: string;
  key: string;
  value: unknown;
  tags?: string[];
  createdAt: string;
}
export type MemoryScope = "short-term" | "session" | "project" | "global";
export interface WorkflowStepResultDTO {
  id: string;
  status: "success" | "failed" | "skipped";
  output?: unknown;
  error?: string;
}
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const api = {
  health: () => get<Health>("/health"),
  agents: () => get<AgentInfo[]>("/agents"),
  providers: () => get<ProvidersInfo>("/providers"),
  tools: () => get<ToolInfo[]>("/tools"),
  tasks: () => get<AshOSEvent[]>("/tasks"),
  events: (prefix?: string) => get<AshOSEvent[]>(`/events${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ""}`),
  logs: () => get<LogEntry[]>("/logs"),
  plan: (goal: string) => post<TaskGraph>("/plan", { goal }),
  chat: (message: string) => post<{ content: string }>("/chat", { messages: [{ role: "user", content: message }] }),
  runWorkflow: (definition: unknown) => post<{ results: Record<string, WorkflowStepResultDTO> }>("/workflow", definition),
  memoryList: (scope?: MemoryScope) => get<MemoryRecord[]>(`/memory${scope ? `?scope=${scope}` : ""}`),
  memoryRemember: (scope: MemoryScope, key: string, value: unknown, tags?: string[]) =>
    post<MemoryRecord>("/memory", { scope, key, value, tags }),
  memoryForget: (scope: MemoryScope, key: string) => post<{ ok: boolean }>("/memory/forget", { scope, key }),

  async chatStream(history: ChatMessage[], onDelta: (delta: string) => void): Promise<void> {
    const res = await fetch(`${BASE}/chat/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: history })
    });
    if (!res.ok || !res.body) throw new Error(`chat stream failed: ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      onDelta(decoder.decode(value, { stream: true }));
    }
  }
};
