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

  app.get("/providers/router", (_req, res) => {
    res.json(ashos.kernel.config.router);
  });

  app.patch("/providers/router", (req, res) => {
    const updated = { ...ashos.kernel.config.router, ...(req.body ?? {}) };
    ashos.kernel.updateConfig({ router: updated });
    res.json(updated);
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

  app.get("/agents/github-trending", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const result = await ashos.runAgent("github-trending", {
        description: "Find trending GitHub repositories focused on AI and productivity",
        input: limit ? { limit } : undefined
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, provider: ashos.providers.active().name() });
  });

  let innovationDiscoveryRunning = false;

  app.post("/innovation/discover", (req, res) => {
    if (innovationDiscoveryRunning) {
      res.status(409).json({ error: "a discovery cycle is already running" });
      return;
    }
    const live = Boolean(req.body?.live);
    const domains = Array.isArray(req.body?.domains) ? req.body.domains : undefined;
    innovationDiscoveryRunning = true;
    const run = live ? ashos.innovation.runLiveDiscovery() : ashos.innovation.runDiscoveryCycle(domains);
    run
      .catch((error) => {
        ashos.kernel.logger.error(`innovation discovery cycle failed: ${(error as Error).message}`);
      })
      .finally(() => {
        innovationDiscoveryRunning = false;
      });
    res.status(202).json({ started: true, live });
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

  app.get("/innovation/live-collectors", (_req, res) => {
    res.json(ashos.innovation.liveCollectors.map((c) => ({ id: c.id, domain: c.domain, description: c.description })));
  });

  let innovationDigestRunning = false;

  app.post("/innovation/digest", (req, res) => {
    if (innovationDigestRunning) {
      res.status(409).json({ error: "a digest run is already in progress" });
      return;
    }
    const sourceIds = Array.isArray(req.body?.sources) ? req.body.sources : undefined;
    innovationDigestRunning = true;
    ashos.innovation
      .generateDigest(sourceIds)
      .then((digest) => res.json(digest))
      .catch((error) => res.status(500).json({ error: (error as Error).message }))
      .finally(() => {
        innovationDigestRunning = false;
      });
  });

  app.get("/innovation/graph", (_req, res) => {
    res.json(ashos.innovation.graph.stats());
  });

  app.get("/innovation/events", (req, res) => {
    const category = req.query.category as never;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const list = category ? ashos.innovation.events.byCategory(category) : ashos.innovation.events.list();
    res.json(limit ? list.slice(0, limit) : list);
  });

  app.get("/innovation/events/:id", (req, res) => {
    const event = ashos.innovation.events.get(req.params.id);
    if (!event) {
      res.status(404).json({ error: `event "${req.params.id}" not found` });
      return;
    }
    res.json(event);
  });

  app.get("/innovation/repositories", (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const list = ashos.innovation.repositories.list();
    res.json(limit ? list.slice(0, limit) : list);
  });

  app.get("/innovation/repositories/:owner/:repo", (req, res) => {
    const profile = ashos.innovation.repositories.get(`${req.params.owner}/${req.params.repo}`);
    if (!profile) {
      res.status(404).json({ error: `no cached analysis for "${req.params.owner}/${req.params.repo}" — POST /innovation/repositories/analyze first` });
      return;
    }
    res.json(profile);
  });

  app.post("/innovation/repositories/analyze", async (req, res) => {
    const fullName = req.body?.fullName;
    if (typeof fullName !== "string" || !fullName.includes("/")) {
      res.status(400).json({ error: "'fullName' must be a non-empty \"owner/repo\" string" });
      return;
    }
    try {
      const result = await ashos.runAgent("repository-analyst", { description: `analyze ${fullName}`, input: { fullName } });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/innovation/ideas", async (req, res) => {
    const { inboxId, content, tags, domain } = req.body ?? {};
    if (!isNonEmptyString(inboxId) && !isNonEmptyString(content)) {
      res.status(400).json({ error: "'inboxId' or 'content' must be provided" });
      return;
    }
    try {
      const result = await ashos.runAgent("idea", {
        description: "capture idea",
        input: { inboxId, content, tags, domain, mergeThreshold: ashos.kernel.config.innovation.mergeThreshold }
      });
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.status(201).json(result.data);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get("/innovation/radar", (req, res) => {
    const ring = req.query.ring as never;
    res.json(ring ? ashos.innovation.radar.byRing(ring) : ashos.innovation.radar.list());
  });

  app.post("/innovation/radar/refresh", async (_req, res) => {
    try {
      const result = await ashos.runAgent("technology-radar", { description: "refresh technology radar" });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get("/innovation/config", (_req, res) => {
    res.json(ashos.kernel.config.innovation);
  });

  app.patch("/innovation/config", (req, res) => {
    const updated = { ...ashos.kernel.config.innovation, ...(req.body ?? {}) };
    ashos.kernel.updateConfig({ innovation: updated });
    res.json(updated);
  });

  app.get("/graph", (_req, res) => {
    res.json(ashos.knowledgeGraph.stats());
  });

  app.get("/graph/nodes", (req, res) => {
    const kind = req.query.kind as never;
    res.json(kind ? ashos.knowledgeGraph.listNodes({ kind }) : ashos.knowledgeGraph.listNodes());
  });

  app.get("/graph/nodes/:id/neighbors", (req, res) => {
    res.json(ashos.knowledgeGraph.neighbors(req.params.id));
  });

  app.post("/inbox", async (req, res) => {
    if (!isNonEmptyString(req.body?.content)) {
      res.status(400).json({ error: "'content' must be a non-empty string" });
      return;
    }
    try {
      const tags = Array.isArray(req.body?.tags) ? req.body.tags : undefined;
      const item = await ashos.inbox.capture(req.body.content, { sourceType: req.body?.sourceType, tags });
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get("/inbox", (req, res) => {
    const status = req.query.status as never;
    res.json(ashos.inbox.list(status ? { status } : undefined));
  });

  app.get("/inbox/:id", (req, res) => {
    const item = ashos.inbox.get(req.params.id);
    if (!item) {
      res.status(404).json({ error: `inbox item "${req.params.id}" not found` });
      return;
    }
    res.json(item);
  });

  app.post("/inbox/:id/archive", async (req, res) => {
    try {
      const item = await ashos.inbox.archive(req.params.id);
      res.json(item);
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  });

  app.get("/search", async (req, res) => {
    const query = req.query.q as string | undefined;
    if (!isNonEmptyString(query)) {
      res.status(400).json({ error: "'q' query parameter is required" });
      return;
    }
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const semantic = req.query.semantic === "true";
    try {
      const results = await ashos.search.search(query, { limit, semantic });
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get("/reflect", async (req, res) => {
    const period = req.query.period as string | undefined;
    try {
      const result = await ashos.runAgent("reflection", { description: "reflect", input: { period } });
      if (!result.ok) {
        res.status(500).json({ error: result.error });
        return;
      }
      res.json(result.data);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get("/codebase", (_req, res) => {
    res.json(ashos.codebase.list());
  });

  app.post("/codebase/index", async (req, res) => {
    const root = typeof req.body?.root === "string" ? req.body.root : ashos.kernel.root;
    const force = Boolean(req.body?.force);
    try {
      const result = await ashos.runAgent("codebase-analyst", { description: `index ${root}`, input: { root, force } });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get("/codebase/search", async (req, res) => {
    const root = typeof req.query.root === "string" ? req.query.root : ashos.kernel.root;
    const query = req.query.q as string | undefined;
    if (!query) {
      res.status(400).json({ error: "'q' query parameter is required" });
      return;
    }
    try {
      const result = await ashos.runAgent("codebase-analyst", { description: `find ${query}`, input: { root, query } });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
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
