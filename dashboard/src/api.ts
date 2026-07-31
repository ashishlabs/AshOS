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

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`);
  return res.json();
}

export interface Health {
  ok: boolean;
  provider: string;
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

export type IntelligenceDomain = "market" | "github" | "community" | "research" | "workflow" | "competitor";
export interface InnovationConfig {
  researchProvider: string;
  researchModel: string;
  domains: IntelligenceDomain[];
  mergeThreshold: number;
  briefSize: number;
}
export interface InnovationStatus {
  running: boolean;
  config: InnovationConfig;
}
export type IdeaLifecycleStage =
  | "captured"
  | "validated"
  | "growing"
  | "researching"
  | "planning"
  | "building"
  | "testing"
  | "released"
  | "archived"
  | "revived";
export interface OpportunitySignal {
  id: string;
  domain: IntelligenceDomain;
  kind: string;
  source: string;
  title: string;
  summary: string;
  url?: string;
  tags: string[];
  confidence: number;
  observedAt: string;
}
export interface Opportunity {
  id: string;
  title: string;
  problemStatement: string;
  tags: string[];
  domains: IntelligenceDomain[];
  signals: OpportunitySignal[];
  score: Record<string, number> & { overall: number };
  stage: IdeaLifecycleStage;
  createdAt: string;
  updatedAt: string;
  history: { at: string; event: string }[];
}
export interface BuilderProfileEntry {
  category: string;
  weight: number;
  signalCount: number;
}
export interface DailyBrief {
  generatedAt: string;
  topOpportunities: Opportunity[];
  newSignalCount: number;
  domainsCovered: IntelligenceDomain[];
  narrative: string;
}
export interface CollectorInfo {
  id: string;
  domain: IntelligenceDomain;
  description: string;
}
export interface KnowledgeGraphStats {
  nodeCount: number;
  edgeCount: number;
  byKind: Record<string, number>;
}

export interface TrendingRepo {
  fullName: string;
  url: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  topics: string[];
  pushedAt: string;
}
export interface TrendingReposResult {
  ok: boolean;
  output?: string;
  data?: { repos: TrendingRepo[]; sinceDays: number; topics: string[] };
  error?: string;
}

export const api = {
  health: () => get<Health>("/health"),
  githubTrending: (limit?: number) => get<TrendingReposResult>(`/agents/github-trending${limit ? `?limit=${limit}` : ""}`),
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

  innovationStatus: () => get<InnovationStatus>("/innovation/status"),
  innovationOpportunities: (limit?: number, stage?: IdeaLifecycleStage) => {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (stage) params.set("stage", stage);
    const qs = params.toString();
    return get<Opportunity[]>(`/innovation/opportunities${qs ? `?${qs}` : ""}`);
  },
  innovationOpportunity: (id: string) => get<Opportunity>(`/innovation/opportunities/${encodeURIComponent(id)}`),
  innovationBrief: () => get<DailyBrief>("/innovation/brief"),
  innovationProfile: (limit?: number) => get<BuilderProfileEntry[]>(`/innovation/profile${limit ? `?limit=${limit}` : ""}`),
  innovationCollectors: () => get<CollectorInfo[]>("/innovation/collectors"),
  innovationGraph: () => get<KnowledgeGraphStats>("/innovation/graph"),
  innovationConfig: () => get<InnovationConfig>("/innovation/config"),
  innovationUpdateConfig: (patchBody: Partial<InnovationConfig>) => patch<InnovationConfig>("/innovation/config", patchBody),
  innovationDiscover: (domains?: IntelligenceDomain[]) => post<{ started: boolean }>("/innovation/discover", { domains }),

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
