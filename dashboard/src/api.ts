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
export type ReflectionPeriod = "daily" | "weekly" | "monthly";
export interface ReflectionData {
  period: ReflectionPeriod;
  windowStart: string;
  windowEnd: string;
  outcomes: { total: number; success: number; failure: number; failures: { agent: string; description: string; error?: string }[] };
  inbox: { captured: number; reviewed: number; archived: number };
  knowledgeGraph: { newNodes: number; byKind: Record<string, number> };
  narrative: string;
  /** Only present on `?cached=true`/`?save=true` responses — when the saved copy was generated. */
  generatedAt?: string;
}
/** Shape of a `MemoryRecord.value` written by `agents/outcome.ts`'s `buildOutcome()`, tagged `"outcome"`/`"failure"`/`"success"`/`<agent name>`. */
export interface TaskOutcome {
  agent: string;
  capability: string;
  taskId: string;
  description: string;
  outcome: "success" | "failure";
  output?: string;
  error?: string;
  durationMs: number;
  at: string;
}
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

export const EVENT_CATEGORIES = [
  "model-release",
  "repository",
  "framework",
  "benchmark",
  "research-paper",
  "startup",
  "funding",
  "acquisition",
  "api-change",
  "pricing-update",
  "security-issue",
  "breaking-change",
  "dataset",
  "developer-tool",
  "library-update"
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export interface EventSource {
  source: string;
  domain: IntelligenceDomain;
  url?: string;
  observedAt: string;
  confidence: number;
}
export interface IntelligenceEvent {
  id: string;
  category: EventCategory;
  title: string;
  summary: string;
  tags: string[];
  domains: IntelligenceDomain[];
  sources: EventSource[];
  confidence: number;
  firstObservedAt: string;
  lastObservedAt: string;
  occurrences: number;
}

export type MaintenanceStatus = "active" | "maintained" | "stale" | "abandoned";
export interface RepositoryProfile {
  fullName: string;
  url: string;
  description: string | null;
  primaryLanguage: string | null;
  languages: Record<string, number>;
  topics: string[];
  license: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  watchers: number;
  contributors: number;
  dependencies: string[];
  createdAt: string;
  pushedAt: string;
  maintenanceStatus: MaintenanceStatus;
  innovationScore: number;
  productionReadiness: number;
  adoptionPotential: number;
  ashosCompatibility: string;
  analyzedAt: string;
}

export const RADAR_RINGS = ["emerging", "growing", "stable", "declining", "obsolete"] as const;
export type RadarRing = (typeof RADAR_RINGS)[number];
export interface RadarEvidence {
  totalMentions: number;
  daysSinceFirstSeen: number;
  daysSinceLastSeen: number;
  mentionsPerDay: number;
}
export interface RadarEntry {
  technology: string;
  ring: RadarRing;
  evidence: RadarEvidence;
  evaluatedAt: string;
}

export interface AgentRunResult {
  ok: boolean;
  output?: string;
  data?: unknown;
  error?: string;
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

export type SearchResultSource = "memory" | "graph" | "inbox" | "vault" | "workspace";
export interface SearchResult {
  source: SearchResultSource;
  id: string;
  title: string;
  snippet: string;
  tags: string[];
  createdAt: string;
  score: number;
}

export type KnowledgeNodeKind =
  | "person" | "company" | "repository" | "product" | "idea" | "problem" | "industry" | "technology"
  | "community" | "language" | "framework" | "market" | "startup" | "paper" | "workflow" | "agent"
  | "project" | "skill" | "tool" | "task" | "resource" | "note" | "todo" | "milestone";
export interface KnowledgeNode {
  id: string;
  kind: KnowledgeNodeKind;
  label: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  data?: Record<string, unknown>;
}
export type KnowledgeEdgeKind = "relates-to" | "produced-by" | "competes-with" | "part-of" | "mentions" | "solves";
export interface KnowledgeEdge {
  id: string;
  from: string;
  to: string;
  kind: KnowledgeEdgeKind;
  weight: number;
  createdAt: string;
  updatedAt: string;
}

export type InboxSourceType = "text" | "note" | "url" | "article" | "github-repo" | "youtube" | "tweet" | "pdf";
export type InboxStatus = "unread" | "reviewed" | "archived";
export interface InboxItem {
  id: string;
  content: string;
  sourceType: InboxSourceType;
  status: InboxStatus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  detectedUrl?: string;
  summary?: string;
}

export type VaultStatus = "active" | "archived";
export interface VaultNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  links: string[];
  status: VaultStatus;
  createdAt: string;
  updatedAt: string;
  sourceInboxId?: string;
}

export type ProjectStatus = "active" | "completed" | "archived";
export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export type ProjectTaskStatus = "todo" | "in-progress" | "done";
export interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: ProjectTaskStatus;
  createdAt: string;
  updatedAt: string;
}

export type MilestoneStatus = "pending" | "done";
export interface Milestone {
  id: string;
  projectId: string;
  title: string;
  dueDate?: string;
  status: MilestoneStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectProgress {
  totalTasks: number;
  doneTasks: number;
  percent: number;
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
  memoryQuery: (opts: { scope?: MemoryScope; tag?: string; text?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.scope) params.set("scope", opts.scope);
    if (opts.tag) params.set("tag", opts.tag);
    if (opts.text) params.set("text", opts.text);
    const qs = params.toString();
    return get<MemoryRecord[]>(`/memory${qs ? `?${qs}` : ""}`);
  },
  memoryRemember: (scope: MemoryScope, key: string, value: unknown, tags?: string[]) =>
    post<MemoryRecord>("/memory", { scope, key, value, tags }),
  memoryForget: (scope: MemoryScope, key: string) => post<{ ok: boolean }>("/memory/forget", { scope, key }),

  inboxCapture: (content: string, tags?: string[]) => post<InboxItem>("/inbox", { content, tags }),
  inboxList: (status?: InboxStatus) => get<InboxItem[]>(`/inbox${status ? `?status=${status}` : ""}`),
  inboxArchive: (id: string) => post<InboxItem>(`/inbox/${encodeURIComponent(id)}/archive`, {}),

  vaultCreate: (title: string, content: string, tags?: string[]) => post<VaultNote>("/vault", { title, content, tags }),
  vaultPromote: (inboxId: string, title?: string) => post<VaultNote>("/vault", { inboxId, title }),
  vaultList: (opts: { status?: VaultStatus; tag?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    if (opts.tag) params.set("tag", opts.tag);
    const qs = params.toString();
    return get<VaultNote[]>(`/vault${qs ? `?${qs}` : ""}`);
  },
  vaultGet: (id: string) => get<VaultNote>(`/vault/${encodeURIComponent(id)}`),
  vaultArchive: (id: string) => post<VaultNote>(`/vault/${encodeURIComponent(id)}/archive`, {}),
  vaultLink: (id: string, targetId: string) => post<VaultNote>(`/vault/${encodeURIComponent(id)}/link`, { targetId }),
  vaultBacklinks: (id: string) => get<VaultNote[]>(`/vault/${encodeURIComponent(id)}/backlinks`),

  projectCreate: (name: string, description?: string, tags?: string[]) =>
    post<Project>("/workspace/projects", { name, description, tags }),
  projectList: (status?: ProjectStatus) => get<Project[]>(`/workspace/projects${status ? `?status=${status}` : ""}`),
  projectGet: (id: string) => get<Project>(`/workspace/projects/${encodeURIComponent(id)}`),
  projectArchive: (id: string) => post<Project>(`/workspace/projects/${encodeURIComponent(id)}/archive`, {}),
  projectProgress: (id: string) => get<ProjectProgress>(`/workspace/projects/${encodeURIComponent(id)}/progress`),
  projectTaskAdd: (projectId: string, title: string, description?: string) =>
    post<ProjectTask>(`/workspace/projects/${encodeURIComponent(projectId)}/tasks`, { title, description }),
  projectTaskList: (projectId: string, status?: ProjectTaskStatus) =>
    get<ProjectTask[]>(`/workspace/projects/${encodeURIComponent(projectId)}/tasks${status ? `?status=${status}` : ""}`),
  projectTaskStatus: (taskId: string, status: ProjectTaskStatus) =>
    post<ProjectTask>(`/workspace/tasks/${encodeURIComponent(taskId)}/status`, { status }),
  projectMilestoneAdd: (projectId: string, title: string, dueDate?: string) =>
    post<Milestone>(`/workspace/projects/${encodeURIComponent(projectId)}/milestones`, { title, dueDate }),
  projectMilestoneList: (projectId: string) => get<Milestone[]>(`/workspace/projects/${encodeURIComponent(projectId)}/milestones`),
  projectMilestoneStatus: (milestoneId: string, status: MilestoneStatus) =>
    post<Milestone>(`/workspace/milestones/${encodeURIComponent(milestoneId)}/status`, { status }),

  captureIdea: (input: { inboxId?: string; content?: string; tags?: string[]; domain?: IntelligenceDomain }) =>
    post<{ opportunity: Opportunity; created: boolean }>("/innovation/ideas", input),

  reflect: (period?: ReflectionPeriod) => get<ReflectionData>(`/reflect${period ? `?period=${period}` : ""}`),
  /** Reads today's already-saved reflection without calling the LLM again — returns `undefined` if none has been saved yet (404), same "check before generating" pattern the Today's Focus card avoids duplicating. */
  reflectCached: async (period: ReflectionPeriod = "daily"): Promise<ReflectionData | undefined> => {
    const res = await fetch(`${BASE}/reflect?period=${period}&cached=true`);
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`GET /reflect?cached=true failed: ${res.status}`);
    return res.json();
  },
  reflectSave: (period: ReflectionPeriod = "daily") => get<ReflectionData>(`/reflect?period=${period}&save=true`),

  graph: () => get<KnowledgeGraphStats>("/graph"),
  graphNodes: (kind?: KnowledgeNodeKind) => get<KnowledgeNode[]>(`/graph/nodes${kind ? `?kind=${kind}` : ""}`),
  graphEdges: () => get<KnowledgeEdge[]>("/graph/edges"),

  search: (query: string, opts: { limit?: number; semantic?: boolean } = {}) => {
    const params = new URLSearchParams({ q: query });
    if (opts.limit) params.set("limit", String(opts.limit));
    if (opts.semantic) params.set("semantic", "true");
    return get<SearchResult[]>(`/search?${params.toString()}`);
  },

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
  innovationDiscover: (options?: { domains?: IntelligenceDomain[]; live?: boolean }) =>
    post<{ started: boolean; live: boolean }>("/innovation/discover", { domains: options?.domains, live: options?.live }),

  innovationEvents: (limit?: number, category?: EventCategory) => {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (category) params.set("category", category);
    const qs = params.toString();
    return get<IntelligenceEvent[]>(`/innovation/events${qs ? `?${qs}` : ""}`);
  },
  innovationEvent: (id: string) => get<IntelligenceEvent>(`/innovation/events/${encodeURIComponent(id)}`),

  innovationRepositories: (limit?: number) => get<RepositoryProfile[]>(`/innovation/repositories${limit ? `?limit=${limit}` : ""}`),
  innovationRepository: (owner: string, repo: string) =>
    get<RepositoryProfile>(`/innovation/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`),
  innovationAnalyzeRepository: (fullName: string) => post<AgentRunResult>("/innovation/repositories/analyze", { fullName }),

  innovationRadar: (ring?: RadarRing) => get<RadarEntry[]>(`/innovation/radar${ring ? `?ring=${ring}` : ""}`),
  innovationRefreshRadar: () => post<AgentRunResult>("/innovation/radar/refresh", {}),

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
