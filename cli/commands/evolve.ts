import { Command } from "commander";
import { AshOS } from "../../sdk/ashos";
import type { ExperimentRecord } from "../../evolution/history/types";
import type { AshOSEvent } from "../../kernel/event-bus";

function resultIcon(result: ExperimentRecord["result"]): string {
  if (result === "accepted") return "✔";
  if (result === "rejected") return "✘";
  if (result === "error") return "⚠";
  return "…";
}

export function registerEvolveCommand(program: Command): void {
  const cmd = program
    .command("evolve")
    .description("Evolution Engine: automated experimentation that continuously improves AshOS");

  cmd
    .command("run")
    .description("Observe -> hypothesize -> mutate -> build -> test -> benchmark -> accept/reject, in an isolated git worktree")
    .option("-m, --max <n>", "max experiments this run (defaults to config.evolution.maxExperiments)", (v) => parseInt(v, 10))
    .option("-p, --parallel <n>", "max concurrent experiments (defaults to config.evolution.parallelExperiments)", (v) => parseInt(v, 10))
    .option("-b, --benchmarks <ids>", "comma-separated benchmark ids to restrict this run to")
    .action(async (opts) => {
      const ashos = new AshOS();
      const pruned = await ashos.evolution.engine.pruneOrphanedExperiments();
      if (pruned.length > 0) {
        console.log(`Pruned ${pruned.length} orphaned worktree(s) left by an unclean shutdown: ${pruned.join(", ")}`);
      }

      const off = ashos.kernel.eventBus.on("evolution:experiment-finished", (e: AshOSEvent<{ id: string; result: string }>) => {
        console.log(`  ${resultIcon(e.payload.result as ExperimentRecord["result"])} ${e.payload.id} — ${e.payload.result}`);
      });

      console.log(`Running evolution cycle (research provider: ${ashos.kernel.config.evolution.researchProvider})...`);
      const results = await ashos.evolution.engine.runCycle({
        maxExperiments: opts.max,
        parallelExperiments: opts.parallel,
        benchmarkIds: opts.benchmarks ? String(opts.benchmarks).split(",") : undefined
      });
      off();

      console.log(`\nCompleted ${results.length} experiment(s).`);
      for (const r of results) {
        console.log(`${resultIcon(r.result)} ${r.id} [${r.mutationId || "n/a"}] ${r.result}${r.reason ? ` — ${r.reason}` : ""}`);
      }
    });

  cmd
    .command("status")
    .description("Show Evolution Engine configuration and history summary")
    .action(() => {
      const ashos = new AshOS();
      const config = ashos.kernel.config.evolution;
      const list = ashos.evolution.history.list();
      const accepted = list.filter((r) => r.result === "accepted").length;
      const rejected = list.filter((r) => r.result === "rejected").length;
      const errors = list.filter((r) => r.result === "error").length;

      console.log(`Research provider: ${config.researchProvider} (${config.researchModel})`);
      console.log(`Max experiments: ${config.maxExperiments}  Parallel: ${config.parallelExperiments}  Timeout: ${config.benchmarkTimeout}s`);
      console.log(`Auto-merge: ${config.autoMerge}  Require tests: ${config.requireTests}`);
      console.log(`\nExperiments: ${list.length} total — ${accepted} accepted, ${rejected} rejected, ${errors} errored`);
      console.log(`Acceptance rate: ${(ashos.evolution.history.acceptanceRate() * 100).toFixed(1)}%`);
    });

  cmd
    .command("list")
    .description("List past experiments, newest first")
    .option("-l, --limit <n>", "max rows", (v) => parseInt(v, 10), 20)
    .action((opts) => {
      const ashos = new AshOS();
      const list = ashos.evolution.history.list().slice(0, opts.limit);
      if (list.length === 0) {
        console.log("No experiments recorded yet. Run `ash evolve run` to start one.");
        return;
      }
      for (const r of list) {
        const score = r.metrics ? r.metrics.weightedOverallScore.toFixed(2) : "n/a";
        console.log(`${resultIcon(r.result)} ${r.id}  [${r.mutationId || "n/a"}]  score=${score}  ${r.result}`);
      }
    });

  cmd
    .command("show <id>")
    .description("Show full detail for one experiment: hypothesis, metrics, decision, logs")
    .action((id: string) => {
      const ashos = new AshOS();
      const record = ashos.evolution.history.get(id);
      if (!record) {
        console.error(`Experiment "${id}" not found.`);
        process.exitCode = 1;
        return;
      }

      console.log(`Experiment ${record.id} — ${record.result}${record.reason ? ` (${record.reason})` : ""}`);
      console.log(`Branch: ${record.gitBranch}${record.gitCommit ? ` @ ${record.gitCommit.slice(0, 8)}` : ""}`);
      console.log(`\nHypothesis: ${record.hypothesis.summary}`);
      console.log(`Implementation plan: ${record.hypothesis.implementationPlan}`);
      console.log(`Expected impact: ${record.hypothesis.expectedImpact}`);
      console.log(`Risks: ${record.hypothesis.risks}`);

      if (record.metrics) {
        console.log(
          `\nMetrics: weighted score ${record.metrics.weightedOverallScore.toFixed(3)}, benchmark ${record.metrics.benchmarkScore.toFixed(3)}, latency ${record.metrics.latencyMs.toFixed(0)}ms`
        );
        console.log(`Build: ${record.metrics.compilationSuccess ? "success" : "FAILED"}  Tests: ${record.metrics.testsPassed ?? 0} passed / ${record.metrics.testsFailed ?? 0} failed`);
      }
      if (record.logs.length > 0) {
        console.log(`\nLog:`);
        for (const line of record.logs) console.log(`  ${line}`);
      }
    });

  cmd
    .command("prune")
    .description(
      "Remove orphaned experiment worktrees/branches left by an unclean shutdown (crash, kill -9, reboot mid-experiment). Safe to run anytime; never touches an accepted experiment kept for manual review."
    )
    .action(async () => {
      const ashos = new AshOS();
      const pruned = await ashos.evolution.engine.pruneOrphanedExperiments();
      if (pruned.length === 0) {
        console.log("Nothing to prune — no orphaned worktrees found.");
        return;
      }
      console.log(`Pruned ${pruned.length} orphaned worktree(s):`);
      for (const id of pruned) console.log(`  ${id}`);
    });

  cmd
    .command("mutations")
    .description("List registered mutations")
    .action(() => {
      const ashos = new AshOS();
      for (const m of ashos.evolution.mutations.list()) {
        console.log(`${m.id} [${m.targetKind}] — ${m.description}`);
      }
    });

  cmd
    .command("benchmarks")
    .description("List registered benchmarks")
    .action(() => {
      const ashos = new AshOS();
      for (const b of ashos.evolution.benchmarks.list()) {
        console.log(`${b.id} [${b.category}] — ${b.description}`);
      }
    });

  cmd
    .command("exec")
    .description(
      "Internal: runs a single input through this workspace's own AshOS pipeline and prints its output as JSON. Used by the Evolution Engine to benchmark a mutated workspace — not meant for interactive use."
    )
    .requiredOption("--input <text>", "input text to run through ashos.run()")
    .action(async (opts) => {
      const ashos = new AshOS();
      try {
        const { results } = await ashos.run(opts.input);
        const content = [...results.values()]
          .map((r) => r.output ?? "")
          .filter(Boolean)
          .join("\n");
        console.log(JSON.stringify({ content }));
      } catch (error) {
        console.log(JSON.stringify({ content: "", error: (error as Error).message }));
      }
    });
}
