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

export interface EvolutionConfig {
  researchProvider: string;
  researchModel: string;
  maxExperiments: number;
  parallelExperiments: number;
  benchmarkTimeout: number;
  autoMerge: boolean;
  requireTests: boolean;
}
export interface EvolutionStatus {
  running: boolean;
  config: EvolutionConfig;
}
export interface EvolutionStats {
  total: number;
  accepted: number;
  rejected: number;
  errors: number;
  acceptanceRate: number;
}
export interface Hypothesis {
  summary: string;
  filesToModify: string[];
  implementationPlan: string;
  expectedImpact: string;
  risks: string;
  benchmarkStrategy: string;
  mutationId: string;
  mutationParams?: Record<string, unknown>;
}
export interface ExperimentMetrics {
  latencyMs: number;
  tokenUsage?: number;
  executionTimeMs: number;
  memoryUsageMb?: number;
  gpuUtilizationPercent?: number;
  toolCalls: number;
  successRate: number;
  failureRate: number;
  compilationSuccess: boolean;
  testsPassed?: number;
  testsFailed?: number;
  benchmarkScore: number;
  weightedOverallScore: number;
}
export interface ExperimentRecord {
  id: string;
  createdAt: string;
  finishedAt?: string;
  status: "pending" | "running" | "completed" | "error";
  hypothesis: Hypothesis;
  mutationId: string;
  mutationParams?: Record<string, unknown>;
  researchProvider: string;
  researchModel: string;
  gitBranch: string;
  gitCommit?: string;
  metrics?: ExperimentMetrics;
  result: "accepted" | "rejected" | "error" | "pending";
  reason?: string;
  logs: string[];
}
export interface MutationInfo {
  id: string;
  name: string;
  description: string;
  targetKind: string;
}
export interface BenchmarkInfo {
  id: string;
  category: string;
  description: string;
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

export const api = {
  health: () => get<Health>("/health"),
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

  evolutionStatus: () => get<EvolutionStatus>("/evolution/status"),
  evolutionStats: () => get<EvolutionStats>("/evolution/stats"),
  evolutionExperiments: (limit?: number) => get<ExperimentRecord[]>(`/evolution/experiments${limit ? `?limit=${limit}` : ""}`),
  evolutionExperiment: (id: string) => get<ExperimentRecord>(`/evolution/experiments/${encodeURIComponent(id)}`),
  evolutionLeaderboard: (limit?: number) => get<ExperimentRecord[]>(`/evolution/leaderboard${limit ? `?limit=${limit}` : ""}`),
  evolutionMutations: () => get<MutationInfo[]>("/evolution/mutations"),
  evolutionBenchmarks: () => get<BenchmarkInfo[]>("/evolution/benchmarks"),
  evolutionConfig: () => get<EvolutionConfig>("/evolution/config"),
  evolutionUpdateConfig: (patchBody: Partial<EvolutionConfig>) => patch<EvolutionConfig>("/evolution/config", patchBody),
  evolutionRun: (options: { maxExperiments?: number; parallelExperiments?: number; benchmarkIds?: string[] }) =>
    post<{ started: boolean }>("/evolution/run", options),

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
