import { useEffect, useState } from "react";
import { api, type AgentInfo, type Health, type ProvidersInfo, type TaskGraph, type ToolInfo } from "./api";

type Tab = "dashboard" | "providers" | "agents" | "tools" | "plan";

export function App() {
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div className="app">
      <header>
        <h1>AshOS</h1>
        <p className="subtitle">AI Operating System for Developers</p>
      </header>
      <nav>
        {(["dashboard", "providers", "agents", "tools", "plan"] as Tab[]).map((t) => (
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
      </main>
    </div>
  );
}

function DashboardTab() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch((e) => setError(e.message));
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
      <div className="plan-form">
        <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Add dark mode to the settings page" />
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
