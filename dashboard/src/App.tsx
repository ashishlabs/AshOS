import { useEffect, useRef, useState } from "react";
import {
  Brain,
  GitBranch,
  Inbox as InboxIcon,
  LayoutDashboard,
  Lightbulb,
  ListTodo,
  Menu,
  Moon,
  Newspaper,
  Play,
  Radar,
  RefreshCw,
  ScrollText,
  Search,
  Send,
  Sparkles,
  Sun,
  Trash2,
  TrendingUp,
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
  type AshOSEvent,
  type BuilderProfileEntry,
  type ChatMessage,
  type CollectorInfo,
  type DailyBrief,
  type Health,
  type IdeaLifecycleStage,
  type InboxItem,
  type InboxStatus,
  type InnovationConfig,
  type KnowledgeGraphStats,
  type LogEntry,
  type IntelligenceEvent,
  type MemoryRecord,
  type MemoryScope,
  type Opportunity,
  type RadarEntry,
  type RadarRing,
  type RepositoryProfile,
  type TaskGraph,
  type TrendingReposResult,
  type WorkflowStepResultDTO
} from "./api";

type Tab = "dashboard" | "inbox" | "plan" | "workflow" | "innovation" | "trending" | "memory" | "logs" | "chat";

const NAV_ITEMS: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "inbox", label: "Inbox", icon: InboxIcon },
  { id: "plan", label: "Plan", icon: ListTodo },
  { id: "workflow", label: "Workflow", icon: GitBranch },
  { id: "innovation", label: "Innovation", icon: Lightbulb },
  { id: "trending", label: "Trending", icon: TrendingUp },
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
  inbox: InboxTab,
  plan: PlanTab,
  workflow: WorkflowTab,
  innovation: InnovationTab,
  trending: TrendingTab,
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

function TrendingTab() {
  const [result, setResult] = useState<TrendingReposResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await api.githubTrending(8));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const repos = result?.data?.repos ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trending: AI &amp; Productivity</CardTitle>
        <CardDescription>
          Real GitHub repositories pushed to recently, ranked by stars — via the <code className="font-mono">github-trending</code> agent.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={load} disabled={loading} variant="outline">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          {loading ? "Searching GitHub…" : result ? "Refresh" : "Find trending repos"}
        </Button>
        <LoadError error={error} />
        {result && !result.ok && <LoadError error={result.error ?? "the agent reported a failure"} />}
        {result?.ok && repos.length === 0 && <EmptyState>No repositories matched — try again later.</EmptyState>}
        {repos.length > 0 && (
          <ul className="divide-y">
            {repos.map((r) => (
              <li key={r.fullName} className="space-y-1 py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <a href={r.url} target="_blank" rel="noreferrer" className="min-w-0 font-medium text-primary hover:underline">
                    {r.fullName}
                  </a>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {r.language && <Badge variant="outline">{r.language}</Badge>}
                    <span className="font-mono text-xs text-muted-foreground">★ {r.stars.toLocaleString()}</span>
                  </div>
                </div>
                {r.description && <p className="text-muted-foreground">{r.description}</p>}
              </li>
            ))}
          </ul>
        )}
        {!result && !error && <EmptyState>Click "Find trending repos" to search GitHub.</EmptyState>}
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

const STAGE_VARIANT: Record<IdeaLifecycleStage, "success" | "destructive" | "warning" | "secondary" | "outline"> = {
  captured: "outline",
  validated: "secondary",
  growing: "warning",
  researching: "secondary",
  planning: "secondary",
  building: "warning",
  testing: "warning",
  released: "success",
  archived: "outline",
  revived: "warning"
};

const RADAR_VARIANT: Record<RadarRing, "success" | "destructive" | "warning" | "secondary" | "outline"> = {
  emerging: "success",
  growing: "secondary",
  stable: "outline",
  declining: "warning",
  obsolete: "destructive"
};

function InnovationTab() {
  const [config, setConfig] = useState<InnovationConfig | null>(null);
  const [running, setRunning] = useState(false);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [profile, setProfile] = useState<BuilderProfileEntry[]>([]);
  const [collectors, setCollectors] = useState<CollectorInfo[]>([]);
  const [graph, setGraph] = useState<KnowledgeGraphStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [events, setEvents] = useState<IntelligenceEvent[]>([]);
  const [radarEntries, setRadarEntries] = useState<RadarEntry[]>([]);
  const [radarLoading, setRadarLoading] = useState(false);
  const [radarError, setRadarError] = useState<string | null>(null);
  const [repositories, setRepositories] = useState<RepositoryProfile[]>([]);
  const [repoInput, setRepoInput] = useState("");
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [liveStarting, setLiveStarting] = useState(false);

  useEffect(() => {
    const load = () =>
      Promise.all([
        api.innovationStatus(),
        api.innovationOpportunities(20),
        api.innovationProfile(6),
        api.innovationCollectors(),
        api.innovationGraph(),
        api.innovationEvents(10),
        api.innovationRadar(),
        api.innovationRepositories()
      ])
        .then(([status, opps, prof, cols, g, evts, radar, repos]) => {
          setConfig(status.config);
          setRunning(status.running);
          setOpportunities(opps);
          setProfile(prof);
          setCollectors(cols);
          setGraph(g);
          setEvents(evts);
          setRadarEntries(radar);
          setRepositories(repos);
          setError(null);
        })
        .catch((e) => setError(e.message));
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const runDiscovery = async (live: boolean) => {
    if (live) setLiveStarting(true);
    else setStarting(true);
    setRunError(null);
    try {
      await api.innovationDiscover({ live });
      setRunning(true);
    } catch (e) {
      setRunError((e as Error).message);
    } finally {
      if (live) setLiveStarting(false);
      else setStarting(false);
    }
  };

  const generateBrief = async () => {
    setBriefLoading(true);
    setBriefError(null);
    try {
      setBrief(await api.innovationBrief());
    } catch (e) {
      setBriefError((e as Error).message);
    } finally {
      setBriefLoading(false);
    }
  };

  const refreshRadar = async () => {
    setRadarLoading(true);
    setRadarError(null);
    try {
      await api.innovationRefreshRadar();
      setRadarEntries(await api.innovationRadar());
    } catch (e) {
      setRadarError((e as Error).message);
    } finally {
      setRadarLoading(false);
    }
  };

  const analyzeRepository = async () => {
    const fullName = repoInput.trim();
    if (!fullName.includes("/")) {
      setRepoError('Enter a repository as "owner/repo"');
      return;
    }
    setRepoLoading(true);
    setRepoError(null);
    try {
      const result = await api.innovationAnalyzeRepository(fullName);
      if (!result.ok) throw new Error(result.error ?? "analysis failed");
      setRepositories(await api.innovationRepositories());
      setRepoInput("");
    } catch (e) {
      setRepoError((e as Error).message);
    } finally {
      setRepoLoading(false);
    }
  };

  const maxWeight = Math.max(1, ...profile.map((p) => p.weight));

  return (
    <div className="space-y-4">
      <LoadError error={error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Innovation Intelligence</CardTitle>
            <CardDescription>
              Continuously discovers opportunities worth building next — observe, merge into ideas, score, track.
            </CardDescription>
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
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-sm">
                  <span className="text-muted-foreground">Domains</span>
                  <div className="flex flex-wrap justify-end gap-1">
                    {config.domains.map((d) => (
                      <Badge key={d} variant="outline">
                        {d}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}
            <Button onClick={() => runDiscovery(false)} disabled={running || starting} className="w-full">
              <Play className="h-4 w-4" />
              {starting ? "Starting…" : running ? "Cycle running…" : "Run discovery cycle"}
            </Button>
            <Button onClick={() => runDiscovery(true)} disabled={running || liveStarting} variant="outline" className="w-full">
              <Search className="h-4 w-4" />
              {liveStarting ? "Starting…" : "Run live discovery (all sources)"}
            </Button>
            <LoadError error={runError} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Knowledge base</CardTitle>
            <CardDescription>What's been observed and merged so far.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground">Opportunities</p>
                <p className="text-xl font-semibold">{opportunities.length}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground">Knowledge nodes</p>
                <p className="text-xl font-semibold">{graph?.nodeCount ?? 0}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground">Relationships</p>
                <p className="text-xl font-semibold">{graph?.edgeCount ?? 0}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground">Categories tracked</p>
                <p className="text-xl font-semibold">{profile.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Builder profile</CardTitle>
          <CardDescription>Categories the recommendation engine currently favors, learned from accumulated signals.</CardDescription>
        </CardHeader>
        <CardContent>
          {profile.length === 0 ? (
            <EmptyState>No signal history yet — run a discovery cycle to start building a profile.</EmptyState>
          ) : (
            <ul className="space-y-2.5">
              {profile.map((p) => (
                <li key={p.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{p.category}</span>
                    <span className="text-muted-foreground">
                      {p.signalCount} signal{p.signalCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[image:var(--gradient-brand)]"
                      style={{ width: `${Math.max(4, (p.weight / maxWeight) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top opportunities</CardTitle>
            <CardDescription>Highest-scoring ideas, ranked by weighted opportunity score.</CardDescription>
          </CardHeader>
          <CardContent>
            {opportunities.length === 0 ? (
              <EmptyState>No opportunities recorded yet — click "Run discovery cycle" to start.</EmptyState>
            ) : (
              <ul className="max-h-96 space-y-2 overflow-y-auto">
                {opportunities.map((o) => (
                  <li key={o.id} className="rounded-lg border p-2.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <Badge variant={STAGE_VARIANT[o.stage] ?? "outline"}>{o.stage}</Badge>
                      <span className="font-mono text-xs">{o.score.overall.toFixed(2)}</span>
                    </div>
                    <p className="mt-1 min-w-0 break-words font-medium">{o.title}</p>
                    {o.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {o.tags.slice(0, 4).map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px]">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Collectors</CardTitle>
            <CardDescription>One per intelligence domain, feeding raw signals into the graph.</CardDescription>
          </CardHeader>
          <CardContent>
            {collectors.length === 0 ? (
              <EmptyState>No collectors registered.</EmptyState>
            ) : (
              <ul className="divide-y">
                {collectors.map((c) => (
                  <li key={c.id} className="space-y-1 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{c.id}</span>
                      <Badge variant="outline">{c.domain}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{c.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Technology Radar</CardTitle>
            <CardDescription>Emerging, growing, stable, declining, or obsolete — classified from knowledge-graph evidence.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={refreshRadar} disabled={radarLoading} variant="outline" className="w-full">
              <Radar className="h-4 w-4" />
              {radarLoading ? "Refreshing…" : "Refresh radar"}
            </Button>
            <LoadError error={radarError} />
            {radarEntries.length === 0 ? (
              <EmptyState>No technologies tracked yet — run a discovery cycle, then refresh the radar.</EmptyState>
            ) : (
              <ul className="max-h-80 space-y-2 overflow-y-auto">
                {radarEntries.map((entry) => (
                  <li key={entry.technology} className="rounded-lg border p-2.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="min-w-0 break-words font-medium">{entry.technology}</span>
                      <Badge variant={RADAR_VARIANT[entry.ring] ?? "outline"}>{entry.ring}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.evidence.totalMentions} mention{entry.evidence.totalMentions === 1 ? "" : "s"} ·{" "}
                      {entry.evidence.mentionsPerDay.toFixed(2)}/day
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Repository Intelligence</CardTitle>
            <CardDescription>Analyze any public GitHub repository into a structured, cached profile.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="owner/repo"
                onKeyDown={(e) => e.key === "Enter" && analyzeRepository()}
              />
              <Button onClick={analyzeRepository} disabled={repoLoading}>
                {repoLoading ? "Analyzing…" : "Analyze"}
              </Button>
            </div>
            <LoadError error={repoError} />
            {repositories.length === 0 ? (
              <EmptyState>No repositories analyzed yet.</EmptyState>
            ) : (
              <ul className="max-h-80 space-y-2 overflow-y-auto">
                {repositories.map((r) => (
                  <li key={r.fullName} className="rounded-lg border p-2.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="min-w-0 break-words font-medium">{r.fullName}</span>
                      <Badge variant="outline">{r.maintenanceStatus}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.stars.toLocaleString()}★ · {r.license ?? "no license"} · {r.primaryLanguage ?? "unknown language"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent events</CardTitle>
          <CardDescription>Canonical, deduplicated events — the normalized layer between raw signals and opportunities.</CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <EmptyState>No events recorded yet — run a discovery cycle to start.</EmptyState>
          ) : (
            <ul className="divide-y">
              {events.map((e) => (
                <li key={e.id} className="space-y-1 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{e.category}</Badge>
                    <span className="min-w-0 break-words text-sm font-medium">{e.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {e.occurrences} source{e.occurrences === 1 ? "" : "s"} · confidence {e.confidence.toFixed(2)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily Innovation Brief</CardTitle>
          <CardDescription>A narrative summary of today's top opportunities and what changed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={generateBrief} disabled={briefLoading} variant="outline">
            <Newspaper className="h-4 w-4" />
            {briefLoading ? "Generating…" : "Generate today's brief"}
          </Button>
          <LoadError error={briefError} />
          {brief && (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm whitespace-pre-wrap">{brief.narrative}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {brief.newSignalCount} new signal{brief.newSignalCount === 1 ? "" : "s"}
                </span>
                <span>·</span>
                <div className="flex flex-wrap gap-1">
                  {brief.domainsCovered.map((d) => (
                    <Badge key={d} variant="outline" className="text-[10px]">
                      {d}
                    </Badge>
                  ))}
                </div>
              </div>
              {brief.topOpportunities.length > 0 && (
                <ul className="space-y-1.5">
                  {brief.topOpportunities.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center justify-between gap-1 text-sm">
                      <span className="min-w-0 break-words font-medium">{o.title}</span>
                      <span className="font-mono text-xs text-muted-foreground">{o.score.overall.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const SCOPES: MemoryScope[] = ["short-term", "session", "project", "global"];

const INBOX_STATUSES: InboxStatus[] = ["unread", "reviewed", "archived"];

function InboxTab() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [status, setStatus] = useState<InboxStatus | "all">("all");
  const [content, setContent] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .inboxList(status === "all" ? undefined : status)
      .then((r) => {
        setItems(r);
        setError(null);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const capture = async () => {
    if (!content.trim()) return;
    setCapturing(true);
    try {
      await api.inboxCapture(content);
      setContent("");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCapturing(false);
    }
  };

  const archive = async (id: string) => {
    try {
      await api.inboxArchive(id);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inbox</CardTitle>
        <CardDescription>Everything enters AshOS through here — text, links, GitHub repos, articles — auto-classified on capture.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && capture()}
            placeholder="Capture a note, link, or idea..."
          />
          <Button onClick={capture} disabled={capturing} className="shrink-0">
            {capturing ? "…" : "Capture"}
          </Button>
        </div>

        <Select value={status} onValueChange={(v) => setStatus(v as InboxStatus | "all")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">all</SelectItem>
            {INBOX_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <LoadError error={error} />
        {items.length === 0 && !error ? (
          <EmptyState>Nothing captured yet.</EmptyState>
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <span className="min-w-0 flex-1 break-words">
                  <Badge variant="outline" className="mr-2">
                    {item.sourceType}
                  </Badge>
                  {item.content}
                </span>
                {item.status !== "archived" && (
                  <Button variant="ghost" size="icon" className="shrink-0" onClick={() => archive(item.id)} aria-label={`Archive ${item.id}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

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
