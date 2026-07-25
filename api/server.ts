import "dotenv/config";
import express, { type Express } from "express";
import cors from "cors";
import { AshOS } from "../sdk/ashos";

export function createServer(ashos: AshOS = new AshOS()): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.post("/chat", async (req, res) => {
    try {
      const result = await ashos.chat(req.body.messages, req.body.options);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/chat/stream", async (req, res) => {
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

  app.post("/plan", async (req, res) => {
    try {
      const graph = await ashos.plan(req.body.goal);
      res.json(graph);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/execute", async (req, res) => {
    try {
      const { graph, results } = await ashos.run(req.body.goal);
      res.json({ graph, results: Object.fromEntries(results) });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/workflow", async (req, res) => {
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

  app.post("/memory", async (req, res) => {
    try {
      const { scope, key, value, tags } = req.body;
      const record = await ashos.memory.remember(scope, key, value, { tags });
      res.json(record);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/memory/forget", (req, res) => {
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

  return app;
}

if (require.main === module) {
  const port = Number(process.env.ASHOS_API_PORT ?? 4700);
  const app = createServer();
  app.listen(port, () => {
    console.log(`AshOS API listening on http://localhost:${port}`);
  });
}
