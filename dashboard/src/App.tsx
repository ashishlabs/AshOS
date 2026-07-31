import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Brain,
  Cpu,
  Dna,
  GitBranch,
  LayoutDashboard,
  ListTodo,
  Menu,
  Moon,
  Play,
  ScrollText,
  Send,
  Sparkles,
  Sun,
  Trash2,
  Wrench,
  X
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  api,
  type AgentInfo,
  type AshOSEvent,
  type ChatMessage,
  type EvolutionConfig,
  type EvolutionStats,
  type ExperimentRecord,
  type Health,
  type LogEntry,
  type MemoryRecord,
  type MemoryScope,
  type ProvidersInfo,
  type TaskGraph,
  type ToolInfo,
  type WorkflowStepResultDTO
} from "./api";

type Tab = "dashboard" | "providers" | "agents" | "tools" | "plan" | "workflow" | "memory" | "logs" | "chat" | "evolution";

const NAV_ITEMS: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "providers", label: "Providers", icon: Cpu },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "plan", label: "Plan", icon: ListTodo },
  { id: "workflow", label: "Workflow", icon: GitBranch },
  { id: "evolution", label: "Evolution", icon: Dna },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "chat", label: "Chat", icon: Send }
];

function useTheme() {
  const [dark, setDark] = useState(() => {
    if (typeof localStorage === "undefined") return true;
    return localStorage.getItem("ashos-theme") !== "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("ashos-theme", dark ? "dark" : "light");
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}

function ThemeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <Button variant="outline" size="icon" onClick={onToggle} aria-label="Toggle theme">
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

function StatusPill() {
  const [health, setHealth] = useState<Health | null>(null);
  const [ok, setOk] = useState(true);

  useEffect(() => {
    const load = () => api.health().then(setHealth).then(() => setOk(true)).catch(() => setOk(false));
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="glass hidden items-center gap-2 rounded-full border px-3 py-1 text-xs sm:flex">
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          ok ? "animate-pulse-glow bg-success text-success" : "bg-destructive text-destructive"
        )}
      />
      {ok && health ? (
        <span className="text-muted-foreground">
          provider <span className="font-medium text-foreground">{health.provider}</span>
        </span>
      ) : (
        <span className="text-destructive">API unreachable</span>
      )}
    </div>
  );
}

const TAB_PANELS: Record<Tab, React.ComponentType> = {
  dashboard: DashboardTab,
  providers: ProvidersTab,
  agents: AgentsTab,
  tools: ToolsTab,
  plan: PlanTab,
  workflow: WorkflowTab,
  evolution: EvolutionTab,
  memory: MemoryTab,
  logs: LogsTab,
  chat: ChatTab
};

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[image:var(--gradient-brand)] shadow-[0_0_20px_-4px_var(--glow-primary)]">
        <Sparkles className="h-4 w-4 text-primary-foreground" />
      </div>
      {!compact && (
        <div>
          <h1 className="text-sm font-bold leading-tight tracking-tight text-gradient">AshOS</h1>
          <p className="text-xs leading-tight text-muted-foreground">AI Operating System for Developers</p>
        </div>
      )}
    </div>
  );
}

function Sidebar({
  tab,
  onSelect,
  open,
  onClose
}: {
  tab: Tab;
  onSelect: (t: Tab) => void;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={cn(
          "glass fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r transition-transform duration-300 ease-in-out md:sticky md:top-0 md:z-0 md:h-screen md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <Logo />
          <Button variant="ghost" size="icon" className="md:hidden" onClick={onClose} aria-label="Close navigation">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => {
                  onSelect(id);
                  onClose();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200",
                  active
                    ? "bg-[image:var(--gradient-brand)] text-primary-foreground shadow-[0_0_16px_-4px_var(--glow-primary)]"
                    : "text-muted-foreground hover:bg-accent/10 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            );
          })}
        </nav>
        <div className="border-t p-3 text-center text-[10px] text-muted-foreground">AshOS v0.1.0</div>
      </aside>
    </>
  );
}

export function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [navOpen, setNavOpen] = useState(false);
  const { dark, toggle } = useTheme();
  const ActivePanel = TAB_PANELS[tab];
  const activeLabel = NAV_ITEMS.find((n) => n.id === tab)?.label ?? "";

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar tab={tab} onSelect={setTab} open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-30 border-b">
          <div className="absolute inset-x-0 bottom-0 h-px bg-[image:var(--gradient-brand)] opacity-60 md:hidden" />
          <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 md:hidden"
                onClick={() => setNavOpen(true)}
                aria-label="Open navigation"
              >
                <Menu className="h-4 w-4" />
              </Button>
              <div className="md:hidden">
                <Logo compact />
              </div>
              <h2 className="hidden truncate text-sm font-semibold text-foreground md:block">{activeLabel}</h2>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill />
              <ThemeToggle dark={dark} onToggle={toggle} />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-4 sm:px-6 sm:py-6">
          <ActivePanel />
        </main>
      </div>
    </div>
  );
}

function LoadError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertDescription>
        Could not load from the AshOS API: {error}. Is <code className="font-mono">npm run api</code> running?
      </AlertDescription>
    </Alert>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function DashboardTab() {
  const [health, setHealth] = useState<Health | null>(null);
  const [events, setEvents] = useState<AshOSEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch((e) => setError(e.message));
    const load = () =>
      api
        .events()
        .then((e) => setEvents(e.filter((ev) => ev.name !== "log").slice(-8).reverse()))
        .catch(() => {});
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>Kernel health and the active AI provider.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <LoadError error={error} />
          {health ? (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Kernel</span>
                <Badge variant={health.ok ? "success" : "destructive"}>{health.ok ? "healthy" : "unhealthy"}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Active provider</span>
                <Badge variant="secondary">{health.provider}</Badge>
              </div>
            </>
          ) : (
            !error && <Skeleton className="h-16 w-full" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Live feed from the kernel event bus.</CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <EmptyState>No events yet — plan a goal, run a workflow, or chat to generate some.</EmptyState>
          ) : (
            <ul className="divide-y">
              {events.map((e, i) => (
                <li key={i} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-mono text-xs text-primary">{e.name}</span>
                  <span className="text-xs text-muted-foreground">{new Date(e.timestamp).toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProvidersTab() {
  const [providers, setProviders] = useState<ProvidersInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.providers().then(setProviders).catch((e) => setError(e.message));
  }, []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Providers</CardTitle>
        <CardDescription>Every AI backend implements the same interface — switching is a config change.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoadError error={error} />
        {!providers && !error && <Skeleton className="h-24 w-full" />}
        {providers && (
          <ul className="divide-y">
            {providers.available.map((p) => (
              <li key={p} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium">{p}</span>
                {p === providers.active && <Badge>active</Badge>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AgentsTab() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.agents().then(setAgents).catch((e) => setError(e.message));
  }, []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Agents</CardTitle>
        <CardDescription>Independent workers, routed to a task by capability tag.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoadError error={error} />
        {agents.length === 0 && !error && <Skeleton className="h-24 w-full" />}
        <ul className="divide-y">
          {agents.map((a) => (
            <li key={a.name} className="space-y-1.5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{a.name}</span>
                {a.capabilities.map((c) => (
                  <Badge key={c} variant="outline">
                    {c}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{a.description}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ToolsTab() {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.tools().then(setTools).catch((e) => setError(e.message));
  }, []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tools</CardTitle>
        <CardDescription>Discoverable capabilities agents and workflows can call.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoadError error={error} />
        {tools.length === 0 && !error && <Skeleton className="h-24 w-full" />}
        <ul className="divide-y">
          {tools.map((t) => (
            <li key={t.name} className="space-y-1.5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{t.name}</span>
                {t.actions.map((a) => (
                  <Badge key={a} variant="outline">
                    {a}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{t.description}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function PlanTab() {
  const [goal, setGoal] = useState("");
  const [graph, setGraph] = useState<TaskGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!goal.trim()) return;
    setError(null);
    setLoading(true);
    try {
      setGraph(await api.plan(goal));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan a goal</CardTitle>
        <CardDescription>Decompose a natural-language goal into a dependency-graph of tasks.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="e.g. Add dark mode toggle to the settings page"
          />
          <Button onClick={submit} disabled={loading} className="shrink-0">
            {loading ? "Planning…" : "Plan"}
          </Button>
        </div>
        <LoadError error={error} />
        {graph && (
          <ol className="space-y-3">
            {graph.tasks.map((t, i) => (
              <li key={t.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {i + 1}
                  </span>
                  <Badge variant="secondary">{t.capability}</Badge>
                  <span className="min-w-0 break-words text-sm font-medium">{t.title}</span>
                </div>
                {t.dependsOn?.length ? (
                  <p className="mt-1 pl-7 text-xs text-muted-foreground">after: {t.dependsOn.join(", ")}</p>
                ) : null}
                <p className="mt-1 pl-7 text-sm text-muted-foreground">{t.description}</p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

const DEFAULT_WORKFLOW = JSON.stringify(
  {
    name: "demo",
    steps: [
      { id: "research", uses: "agent:research", params: { description: "Research the topic" } },
      { id: "write", uses: "agent:code", dependsOn: ["research"], params: { description: "Write a one-line summary" } }
    ]
  },
  null,
  2
);

const STATUS_VARIANT: Record<string, "success" | "destructive" | "warning"> = {
  success: "success",
  failed: "destructive",
  skipped: "warning"
};

function WorkflowTab() {
  const [source, setSource] = useState(DEFAULT_WORKFLOW);
  const [results, setResults] = useState<Record<string, WorkflowStepResultDTO> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setError(null);
    setResults(null);
    let definition: unknown;
    try {
      definition = JSON.parse(source);
    } catch {
      setError("Invalid JSON");
      return;
    }
    setLoading(true);
    try {
      const { results } = await api.runWorkflow(definition);
      setResults(results);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Run a workflow</CardTitle>
        <CardDescription>
          Paste a workflow definition (see <code className="font-mono">examples/workflows/</code>) or edit the default below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea rows={10} value={source} onChange={(e) => setSource(e.target.value)} />
        <Button onClick={run} disabled={loading}>
          {loading ? "Running…" : "Run workflow"}
        </Button>
        <LoadError error={error} />
        {results && (
          <ul className="space-y-2">
            {Object.values(results).map((r) => (
              <li key={r.id} className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>{r.status}</Badge>
                  <span className="text-sm font-medium">{r.id}</span>
                </div>
                {r.error && <p className="mt-1 text-sm text-destructive">{r.error}</p>}
                {r.output != null && <p className="mt-1 text-sm text-muted-foreground">{String(r.output)}</p>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function LatencySparkline({ points }: { points: { id: string; latencyMs: number }[] }) {
  if (points.length < 2) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Not enough completed experiments yet for a trend.</p>;
  }

  const width = 600;
  const height = 64;
  const padding = 6;
  const values = points.map((p) => p.latencyMs);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = padding + (i / (points.length - 1)) * (width - padding * 2);
    const y = height - padding - ((p.latencyMs - min) / range) * (height - padding * 2);
    return { x, y, ...p };
  });
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full" preserveAspectRatio="none" role="img" aria-label="Latency over time">
      <path d={path} className="fill-none stroke-primary" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((c) => (
        <circle key={c.id} cx={c.x} cy={c.y} r={3} className="fill-primary">
          <title>{`${c.id}: ${c.latencyMs.toFixed(0)}ms`}</title>
        </circle>
      ))}
    </svg>
  );
}

const EVOLUTION_RESULT_VARIANT: Record<string, "success" | "destructive" | "warning" | "outline"> = {
  accepted: "success",
  rejected: "destructive",
  error: "warning",
  pending: "outline"
};

function EvolutionTab() {
  const [config, setConfig] = useState<EvolutionConfig | null>(null);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<EvolutionStats | null>(null);
  const [experiments, setExperiments] = useState<ExperimentRecord[]>([]);
  const [leaderboard, setLeaderboard] = useState<ExperimentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      Promise.all([api.evolutionStatus(), api.evolutionStats(), api.evolutionExperiments(20), api.evolutionLeaderboard(5)])
        .then(([status, s, exps, board]) => {
          setConfig(status.config);
          setRunning(status.running);
          setStats(s);
          setExperiments(exps);
          setLeaderboard(board);
          setError(null);
        })
        .catch((e) => setError(e.message));
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, []);

  const runOne = async () => {
    setStarting(true);
    setRunError(null);
    try {
      await api.evolutionRun({ maxExperiments: 1, parallelExperiments: 1 });
      setRunning(true);
    } catch (e) {
      setRunError((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const latencyPoints = [...experiments]
    .filter((e) => e.metrics)
    .reverse()
    .map((e) => ({ id: e.id, latencyMs: e.metrics!.latencyMs }));

  return (
    <div className="space-y-4">
      <LoadError error={error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Evolution Engine</CardTitle>
            <CardDescription>Continuous, reversible experimentation — observe, hypothesize, mutate, benchmark, accept or reject.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {config && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-1 text-sm">
                  <span className="text-muted-foreground">Research provider</span>
                  <Badge variant="secondary" className="break-all text-right">
                    {config.researchProvider} · {config.researchModel}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={running ? "warning" : "outline"}>{running ? "running" : "idle"}</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Auto-merge</span>
                  <Badge variant={config.autoMerge ? "success" : "outline"}>{config.autoMerge ? "on" : "off"}</Badge>
                </div>
              </>
            )}
            <Button onClick={runOne} disabled={running || starting} className="w-full">
              <Play className="h-4 w-4" />
              {starting ? "Starting…" : running ? "Cycle running…" : "Run one experiment"}
            </Button>
            <LoadError error={runError} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>History summary</CardTitle>
            <CardDescription>Across all experiments ever run.</CardDescription>
          </CardHeader>
          <CardContent>
            {stats && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground">Total</p>
                  <p className="text-xl font-semibold">{stats.total}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground">Acceptance rate</p>
                  <p className="text-xl font-semibold">{(stats.acceptanceRate * 100).toFixed(0)}%</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground">Accepted / Rejected</p>
                  <p className="text-xl font-semibold">
                    <span className="text-success">{stats.accepted}</span> / <span className="text-destructive">{stats.rejected}</span>
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground">Errors</p>
                  <p className="text-xl font-semibold">{stats.errors}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Latency</CardTitle>
          <CardDescription>Average benchmark latency per completed experiment, oldest to newest.</CardDescription>
        </CardHeader>
        <CardContent>
          <LatencySparkline points={latencyPoints} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Leaderboard</CardTitle>
            <CardDescription>Highest-scoring accepted experiments.</CardDescription>
          </CardHeader>
          <CardContent>
            {leaderboard.length === 0 ? (
              <EmptyState>No accepted experiments yet.</EmptyState>
            ) : (
              <ul className="space-y-2">
                {leaderboard.map((r) => (
                  <li key={r.id} className="rounded-lg border p-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">{r.mutationId}</Badge>
                      <span className="font-mono text-xs">{r.metrics?.weightedOverallScore.toFixed(3)}</span>
                    </div>
                    <p className="mt-1 text-muted-foreground">{r.hypothesis.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
            <CardDescription>Most recent experiments, newest first.</CardDescription>
          </CardHeader>
          <CardContent>
            {experiments.length === 0 ? (
              <EmptyState>No experiments recorded yet — click "Run one experiment" to start.</EmptyState>
            ) : (
              <ul className="max-h-80 space-y-2 overflow-y-auto">
                {experiments.map((r) => (
                  <li key={r.id} className="rounded-lg border p-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={EVOLUTION_RESULT_VARIANT[r.result] ?? "outline"}>{r.result}</Badge>
                        <span className="font-mono text-xs text-muted-foreground">{r.mutationId || "n/a"}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <p className="mt-1 text-muted-foreground">{r.reason ?? r.hypothesis.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const SCOPES: MemoryScope[] = ["short-term", "session", "project", "global"];

function MemoryTab() {
  const [scope, setScope] = useState<MemoryScope>("project");
  const [records, setRecords] = useState<MemoryRecord[]>([]);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .memoryList(scope)
      .then((r) => {
        setRecords(r);
        setError(null);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const remember = async () => {
    if (!key.trim()) return;
    try {
      await api.memoryRemember(scope, key, value);
      setKey("");
      setValue("");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const forget = async (k: string) => {
    try {
      await api.memoryForget(scope, k);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Memory</CardTitle>
        <CardDescription>Short-term, session, project, and global scopes with semantic recall.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select value={scope} onValueChange={(v) => setScope(v as MemoryScope)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCOPES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="key" />
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="value" />
          <Button onClick={remember} className="shrink-0">
            Remember
          </Button>
        </div>

        <LoadError error={error} />
        {records.length === 0 && !error ? (
          <EmptyState>No records in "{scope}" memory yet.</EmptyState>
        ) : (
          <ul className="divide-y">
            {records.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <span className="min-w-0 flex-1 break-words">
                  <span className="font-medium">{r.key}</span> = {JSON.stringify(r.value)}
                </span>
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => forget(r.key)} aria-label={`Forget ${r.key}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function LogsTab() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      api
        .logs()
        .then((l) => {
          setLogs([...l].reverse());
          setError(null);
        })
        .catch((e) => setError(e.message));
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  const levelVariant: Record<LogEntry["level"], "destructive" | "warning" | "secondary" | "outline"> = {
    error: "destructive",
    warn: "warning",
    info: "secondary",
    debug: "outline"
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logs</CardTitle>
        <CardDescription>Every event bus emission is mirrored here in real time.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoadError error={error} />
        {logs.length === 0 && !error ? (
          <EmptyState>No log entries yet for the running API process.</EmptyState>
        ) : (
          <ul className="max-h-[28rem] space-y-1.5 overflow-y-auto font-mono text-xs">
            {logs.map((l, i) => (
              <li key={i} className="flex items-start gap-2 border-b py-1.5">
                <span className="shrink-0 text-muted-foreground">{new Date(l.timestamp).toLocaleTimeString()}</span>
                <Badge variant={levelVariant[l.level]} className="shrink-0 px-1.5 py-0 text-[10px]">
                  {l.level}
                </Badge>
                <span className="break-all">{l.message}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ChatTab() {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const next = [...history, { role: "user" as const, content: text }, { role: "assistant" as const, content: "" }];
    setHistory(next);
    setSending(true);
    setError(null);
    try {
      await api.chatStream(next.slice(0, -1), (delta) => {
        setHistory((h) => {
          const copy = [...h];
          copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + delta };
          return copy;
        });
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chat</CardTitle>
        <CardDescription>Talk to the active provider directly.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <LoadError error={error} />
        <div className="flex max-h-[26rem] min-h-[10rem] flex-col gap-3 overflow-y-auto rounded-lg border bg-muted/30 p-4">
          {history.length === 0 && <EmptyState>Say hello to the active provider.</EmptyState>}
          {history.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words sm:max-w-[80%]",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "border bg-card"
                )}
              >
                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                  {m.role === "user" ? "you" : "ash"}
                </p>
                {m.content}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Type a message..."
          />
          <Button onClick={send} disabled={sending} className="shrink-0">
            <Send className="h-4 w-4" />
            {sending ? "…" : "Send"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
