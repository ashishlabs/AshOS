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

export const api = {
  health: () => get<Health>("/health"),
  agents: () => get<AgentInfo[]>("/agents"),
  providers: () => get<ProvidersInfo>("/providers"),
  tools: () => get<ToolInfo[]>("/tools"),
  tasks: () => get<unknown[]>("/tasks"),
  logs: () => get<unknown[]>("/logs"),
  plan: (goal: string) => post<TaskGraph>("/plan", { goal }),
  chat: (message: string) => post<{ content: string }>("/chat", { messages: [{ role: "user", content: message }] })
};
