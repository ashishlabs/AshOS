import "dotenv/config";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { AshOS } from "../sdk/ashos";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function requireMessages(req: Request, res: Response, next: NextFunction): void {
  if (!Array.isArray(req.body?.messages) || req.body.messages.length === 0) {
    res.status(400).json({ error: "'messages' must be a non-empty array" });
    return;
  }
  next();
}

function requireGoal(req: Request, res: Response, next: NextFunction): void {
  if (!isNonEmptyString(req.body?.goal)) {
    res.status(400).json({ error: "'goal' must be a non-empty string" });
    return;
  }
  next();
}

function requireWorkflow(req: Request, res: Response, next: NextFunction): void {
  if (!isNonEmptyString(req.body?.name) || !Array.isArray(req.body?.steps)) {
    res.status(400).json({ error: "workflow definition must have a 'name' string and a 'steps' array" });
    return;
  }
  next();
}

export function createServer(ashos: AshOS = new AshOS()): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Startup sweep: remove any evolution worktrees/branches orphaned by an
  // unclean shutdown (crash, kill -9, reboot) before anything else can
  // observe or race with them. Best-effort — a failure here shouldn't
  // block the API from starting.
  ashos.evolution.engine.pruneOrphanedExperiments().catch((error) => {
    ashos.kernel.logger.error(`evolution startup prune failed: ${(error as Error).message}`);
  });

  app.post("/chat", requireMessages, async (req, res) => {
    try {
      const result = await ashos.chat(req.body.messages, req.body.options);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/chat/stream", requireMessages, async (req, res) => {
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.setHeader("cache-control", "no-cache");
    res.setHeader("transfer-encoding", "chunked");
    try {
      const provider = ashos.providers.active();
      for await (const chunk of provider.stream(req.body.messages, req.body.options)) {
        if (chunk.delta) res.write(chunk.delta);
      }
      res.end();
    } catch (error) {
      res.write(`\n[error: ${(error as Error).message}]`);
      res.end();
    }
  });

  app.post("/plan", requireGoal, async (req, res) => {
    try {
      const graph = await ashos.plan(req.body.goal);
      res.json(graph);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/execute", requireGoal, async (req, res) => {
    try {
      const { graph, results } = await ashos.run(req.body.goal);
      res.json({ graph, results: Object.fromEntries(results) });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/workflow", requireWorkflow, async (req, res) => {
    try {
      const results = await ashos.runWorkflow(req.body);
      res.json({ results: Object.fromEntries(results) });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get("/agents", (_req, res) => {
    res.json(ashos.agents.list().map((a) => ({ name: a.name, description: a.description, capabilities: a.capabilities })));
  });

  app.get("/providers", (_req, res) => {
    res.json({ active: ashos.providers.active().name(), available: ashos.providers.list() });
  });

  app.get("/tools", async (_req, res) => {
    res.json(ashos.tools.list().map((t) => t.capabilities()));
  });

  app.get("/tasks", (_req, res) => {
    res.json(ashos.kernel.eventBus.getHistory().filter((e) => e.name.startsWith("task:")));
  });

  app.get("/events", (req, res) => {
    const prefix = req.query.prefix as string | undefined;
    const history = ashos.kernel.eventBus.getHistory();
    res.json(prefix ? history.filter((e) => e.name.startsWith(prefix)) : history);
  });

  app.get("/memory", (req, res) => {
    const scope = req.query.scope as never;
    res.json(ashos.memory.query({ scope, tag: req.query.tag as string, text: req.query.text as string }));
  });

  const MEMORY_SCOPES = new Set(["short-term", "session", "project", "global"]);

  function requireScopeAndKey(req: Request, res: Response, next: NextFunction): void {
    if (!MEMORY_SCOPES.has(req.body?.scope)) {
      res.status(400).json({ error: `'scope' must be one of ${[...MEMORY_SCOPES].join(", ")}` });
      return;
    }
    if (!isNonEmptyString(req.body?.key)) {
      res.status(400).json({ error: "'key' must be a non-empty string" });
      return;
    }
    next();
  }

  app.post("/memory", requireScopeAndKey, async (req, res) => {
    try {
      const { scope, key, value, tags } = req.body;
      const record = await ashos.memory.remember(scope, key, value, { tags });
      res.json(record);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/memory/forget", requireScopeAndKey, (req, res) => {
    const { scope, key } = req.body;
    ashos.memory.forget(scope, key);
    res.json({ ok: true });
  });

  app.get("/logs", (_req, res) => {
    res.json(ashos.kernel.logger.getEntries());
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, provider: ashos.providers.active().name() });
  });

  let evolutionRunning = false;

  app.post("/evolution/run", (req, res) => {
    if (evolutionRunning) {
      res.status(409).json({ error: "an evolution cycle is already running" });
      return;
    }
    const options = {
      maxExperiments: typeof req.body?.maxExperiments === "number" ? req.body.maxExperiments : undefined,
      parallelExperiments: typeof req.body?.parallelExperiments === "number" ? req.body.parallelExperiments : undefined,
      benchmarkIds: Array.isArray(req.body?.benchmarkIds) ? req.body.benchmarkIds : undefined
    };
    evolutionRunning = true;
    ashos.evolution.engine
      .runCycle(options)
      .catch((error) => {
        ashos.kernel.logger.error(`evolution cycle failed: ${(error as Error).message}`);
      })
      .finally(() => {
        evolutionRunning = false;
      });
    res.status(202).json({ started: true });
  });

  app.get("/evolution/status", (_req, res) => {
    res.json({ running: evolutionRunning, config: ashos.kernel.config.evolution });
  });

  app.get("/evolution/experiments", (req, res) => {
    const list = ashos.evolution.history.list();
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    res.json(limit ? list.slice(0, limit) : list);
  });

  app.get("/evolution/experiments/:id", (req, res) => {
    const record = ashos.evolution.history.get(req.params.id);
    if (!record) {
      res.status(404).json({ error: `experiment "${req.params.id}" not found` });
      return;
    }
    res.json(record);
  });

  app.get("/evolution/leaderboard", (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    res.json(ashos.evolution.history.leaderboard(limit));
  });

  app.get("/evolution/stats", (_req, res) => {
    const list = ashos.evolution.history.list();
    res.json({
      total: list.length,
      accepted: list.filter((r) => r.result === "accepted").length,
      rejected: list.filter((r) => r.result === "rejected").length,
      errors: list.filter((r) => r.result === "error").length,
      acceptanceRate: ashos.evolution.history.acceptanceRate()
    });
  });

  app.get("/evolution/mutations", (_req, res) => {
    res.json(ashos.evolution.mutations.list().map((m) => ({ id: m.id, name: m.name, description: m.description, targetKind: m.targetKind })));
  });

  app.get("/evolution/benchmarks", (_req, res) => {
    res.json(ashos.evolution.benchmarks.list().map((b) => ({ id: b.id, category: b.category, description: b.description })));
  });

  app.get("/evolution/config", (_req, res) => {
    res.json(ashos.kernel.config.evolution);
  });

  app.patch("/evolution/config", (req, res) => {
    const updated = { ...ashos.kernel.config.evolution, ...(req.body ?? {}) };
    ashos.kernel.updateConfig({ evolution: updated });
    res.json(updated);
  });

  let innovationDiscoveryRunning = false;

  app.post("/innovation/discover", (req, res) => {
    if (innovationDiscoveryRunning) {
      res.status(409).json({ error: "a discovery cycle is already running" });
      return;
    }
    const domains = Array.isArray(req.body?.domains) ? req.body.domains : undefined;
    innovationDiscoveryRunning = true;
    ashos.innovation
      .runDiscoveryCycle(domains)
      .catch((error) => {
        ashos.kernel.logger.error(`innovation discovery cycle failed: ${(error as Error).message}`);
      })
      .finally(() => {
        innovationDiscoveryRunning = false;
      });
    res.status(202).json({ started: true });
  });

  app.get("/innovation/status", (_req, res) => {
    res.json({ running: innovationDiscoveryRunning, config: ashos.kernel.config.innovation });
  });

  app.get("/innovation/opportunities", (req, res) => {
    const stage = req.query.stage as never;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const list = stage ? ashos.innovation.opportunities.byStage(stage) : ashos.innovation.opportunities.topOpportunities(limit ?? 1000);
    res.json(limit ? list.slice(0, limit) : list);
  });

  app.get("/innovation/opportunities/:id", (req, res) => {
    const opportunity = ashos.innovation.opportunities.get(req.params.id);
    if (!opportunity) {
      res.status(404).json({ error: `opportunity "${req.params.id}" not found` });
      return;
    }
    res.json(opportunity);
  });

  app.get("/innovation/brief", async (_req, res) => {
    try {
      res.json(await ashos.innovation.generateBrief());
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get("/innovation/profile", (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 15;
    res.json(ashos.innovation.profile.topCategories(limit));
  });

  app.get("/innovation/collectors", (_req, res) => {
    res.json(ashos.innovation.collectors.list().map((c) => ({ id: c.id, domain: c.domain, description: c.description })));
  });

  app.get("/innovation/graph", (_req, res) => {
    res.json(ashos.innovation.graph.stats());
  });

  app.get("/innovation/config", (_req, res) => {
    res.json(ashos.kernel.config.innovation);
  });

  app.patch("/innovation/config", (req, res) => {
    const updated = { ...ashos.kernel.config.innovation, ...(req.body ?? {}) };
    ashos.kernel.updateConfig({ innovation: updated });
    res.json(updated);
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.ASHOS_API_PORT ?? 4700);
  const app = createServer();
  app.listen(port, () => {
    console.log(`AshOS API listening on http://localhost:${port}`);
  });
}
