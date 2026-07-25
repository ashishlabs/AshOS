import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Brain,
  Cpu,
  GitBranch,
  LayoutDashboard,
  ListTodo,
  Moon,
  ScrollText,
  Send,
  Sparkles,
  Sun,
  Trash2,
  Wrench
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  type Health,
  type LogEntry,
  type MemoryRecord,
  type MemoryScope,
  type ProvidersInfo,
  type TaskGraph,
  type ToolInfo,
  type WorkflowStepResultDTO
} from "./api";

type Tab = "dashboard" | "providers" | "agents" | "tools" | "plan" | "workflow" | "memory" | "logs" | "chat";

const NAV_ITEMS: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "providers", label: "Providers", icon: Cpu },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "plan", label: "Plan", icon: ListTodo },
  { id: "workflow", label: "Workflow", icon: GitBranch },
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
    <div className="hidden items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs sm:flex">
      <span className={cn("h-2 w-2 rounded-full", ok ? "bg-success" : "bg-destructive")} />
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

export function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const { dark, toggle } = useTheme();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight">AshOS</h1>
              <p className="text-xs leading-tight text-muted-foreground">AI Operating System for Developers</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill />
            <ThemeToggle dark={dark} onToggle={toggle} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className="h-auto flex-wrap justify-start">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <TabsTrigger key={id} value={id} className="gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="dashboard">
            <DashboardTab />
          </TabsContent>
          <TabsContent value="providers">
            <ProvidersTab />
          </TabsContent>
          <TabsContent value="agents">
            <AgentsTab />
          </TabsContent>
          <TabsContent value="tools">
            <ToolsTab />
          </TabsContent>
          <TabsContent value="plan">
            <PlanTab />
          </TabsContent>
          <TabsContent value="workflow">
            <WorkflowTab />
          </TabsContent>
          <TabsContent value="memory">
            <MemoryTab />
          </TabsContent>
          <TabsContent value="logs">
            <LogsTab />
          </TabsContent>
          <TabsContent value="chat">
            <ChatTab />
          </TabsContent>
        </Tabs>
      </main>
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
        <div className="flex gap-2">
          <Input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="e.g. Add dark mode toggle to the settings page"
          />
          <Button onClick={submit} disabled={loading}>
            {loading ? "Planning…" : "Plan"}
          </Button>
        </div>
        <LoadError error={error} />
        {graph && (
          <ol className="space-y-3">
            {graph.tasks.map((t, i) => (
              <li key={t.id} className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {i + 1}
                  </span>
                  <Badge variant="secondary">{t.capability}</Badge>
                  <span className="text-sm font-medium">{t.title}</span>
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
                <span>
                  <span className="font-medium">{r.key}</span> = {JSON.stringify(r.value)}
                </span>
                <Button variant="ghost" size="icon" onClick={() => forget(r.key)} aria-label={`Forget ${r.key}`}>
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
                  "max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
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
