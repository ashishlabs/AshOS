import { useEffect, useRef, useState } from "react";
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

const TABS: Tab[] = ["dashboard", "providers", "agents", "tools", "plan", "workflow", "memory", "logs", "chat"];

export function App() {
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div className="app">
      <header>
        <h1>AshOS</h1>
        <p className="subtitle">AI Operating System for Developers</p>
      </header>
      <nav>
        {TABS.map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      <main>
        {tab === "dashboard" && <DashboardTab />}
        {tab === "providers" && <ProvidersTab />}
        {tab === "agents" && <AgentsTab />}
        {tab === "tools" && <ToolsTab />}
        {tab === "plan" && <PlanTab />}
        {tab === "workflow" && <WorkflowTab />}
        {tab === "memory" && <MemoryTab />}
        {tab === "logs" && <LogsTab />}
        {tab === "chat" && <ChatTab />}
      </main>
    </div>
  );
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
    <section>
      <h2>Status</h2>
      {error && <p className="error">Could not reach AshOS API: {error}. Start it with `npm run api`.</p>}
      {health && (
        <ul>
          <li>Kernel: {health.ok ? "healthy" : "unhealthy"}</li>
          <li>Active provider: {health.provider}</li>
        </ul>
      )}

      <h2>Recent activity</h2>
      {events.length === 0 && <p className="desc">No events yet — plan a goal, run a workflow, or chat to generate some.</p>}
      <ul className="activity">
        {events.map((e, i) => (
          <li key={i}>
            <span className="event-name">{e.name}</span>
            <span className="event-time">{new Date(e.timestamp).toLocaleTimeString()}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProvidersTab() {
  const [providers, setProviders] = useState<ProvidersInfo | null>(null);
  useEffect(() => {
    api.providers().then(setProviders).catch(() => {});
  }, []);
  return (
    <section>
      <h2>Providers</h2>
      {providers && (
        <ul>
          {providers.available.map((p) => (
            <li key={p}>{p === providers.active ? `* ${p} (active)` : p}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AgentsTab() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  useEffect(() => {
    api.agents().then(setAgents).catch(() => {});
  }, []);
  return (
    <section>
      <h2>Agents</h2>
      <ul>
        {agents.map((a) => (
          <li key={a.name}>
            <strong>{a.name}</strong> — {a.description} <em>[{a.capabilities.join(", ")}]</em>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ToolsTab() {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  useEffect(() => {
    api.tools().then(setTools).catch(() => {});
  }, []);
  return (
    <section>
      <h2>Tools</h2>
      <ul>
        {tools.map((t) => (
          <li key={t.name}>
            <strong>{t.name}</strong> — {t.description} <em>[{t.actions.join(", ")}]</em>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PlanTab() {
  const [goal, setGoal] = useState("");
  const [graph, setGraph] = useState<TaskGraph | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!goal.trim()) return;
    setLoading(true);
    try {
      setGraph(await api.plan(goal));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <h2>Plan a goal</h2>
      <div className="row-form">
        <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Add dark mode toggle to the settings page" />
        <button onClick={submit} disabled={loading}>
          {loading ? "Planning..." : "Plan"}
        </button>
      </div>
      {graph && (
        <ol>
          {graph.tasks.map((t) => (
            <li key={t.id}>
              <strong>[{t.capability}]</strong> {t.title}
              {t.dependsOn?.length ? <span className="deps"> (after: {t.dependsOn.join(", ")})</span> : null}
              <div className="desc">{t.description}</div>
            </li>
          ))}
        </ol>
      )}
    </section>
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
    <section>
      <h2>Run a workflow</h2>
      <p className="desc">Paste a workflow definition (see examples/workflows/) or edit the default below.</p>
      <textarea rows={10} value={source} onChange={(e) => setSource(e.target.value)} />
      <div className="row-form">
        <button onClick={run} disabled={loading}>
          {loading ? "Running..." : "Run workflow"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {results && (
        <ul>
          {Object.values(results).map((r) => (
            <li key={r.id}>
              <span className={`status-badge status-${r.status}`}>{r.status}</span> <strong>{r.id}</strong>
              {r.error && <div className="error">{r.error}</div>}
              {r.output != null && <div className="desc">{String(r.output)}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const SCOPES: MemoryScope[] = ["short-term", "session", "project", "global"];

function MemoryTab() {
  const [scope, setScope] = useState<MemoryScope>("project");
  const [records, setRecords] = useState<MemoryRecord[]>([]);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  const load = () => api.memoryList(scope).then(setRecords).catch(() => setRecords([]));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const remember = async () => {
    if (!key.trim()) return;
    await api.memoryRemember(scope, key, value);
    setKey("");
    setValue("");
    load();
  };

  const forget = async (k: string) => {
    await api.memoryForget(scope, k);
    load();
  };

  return (
    <section>
      <h2>Memory</h2>
      <div className="row-form">
        <select value={scope} onChange={(e) => setScope(e.target.value as MemoryScope)}>
          {SCOPES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="row-form">
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="key" />
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="value" />
        <button onClick={remember}>Remember</button>
      </div>

      {records.length === 0 && <p className="desc">No records in "{scope}" memory yet.</p>}
      <ul>
        {records.map((r) => (
          <li key={r.id}>
            <strong>{r.key}</strong> = {JSON.stringify(r.value)}
            <button className="link-button" onClick={() => forget(r.key)}>
              forget
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LogsTab() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    const load = () => api.logs().then((l) => setLogs([...l].reverse())).catch(() => {});
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section>
      <h2>Logs</h2>
      {logs.length === 0 && <p className="desc">No log entries yet for the running API process.</p>}
      <ul className="log-list">
        {logs.map((l, i) => (
          <li key={i} className={`log-${l.level}`}>
            <span className="log-time">{new Date(l.timestamp).toLocaleTimeString()}</span>
            <span className="log-level">{l.level.toUpperCase()}</span>
            <span>{l.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChatTab() {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
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
    try {
      await api.chatStream(
        next.slice(0, -1),
        (delta) => {
          setHistory((h) => {
            const copy = [...h];
            copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + delta };
            return copy;
          });
        }
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <section>
      <h2>Chat</h2>
      <div className="chat-log">
        {history.length === 0 && <p className="desc">Say hello to the active provider.</p>}
        {history.map((m, i) => (
          <div key={i} className={`bubble bubble-${m.role}`}>
            <strong>{m.role === "user" ? "you" : "ash"}</strong>
            <div>{m.content}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="row-form">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a message..."
        />
        <button onClick={send} disabled={sending}>
          {sending ? "..." : "Send"}
        </button>
      </div>
    </section>
  );
}
