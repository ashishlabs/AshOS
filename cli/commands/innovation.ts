import { Command } from "commander";
import { AshOS } from "../../sdk/ashos";
import type { IdeaLifecycleStage, Opportunity } from "../../innovation/types";
import type { IntelligenceDomain } from "../../kernel/config";

function stageIcon(stage: IdeaLifecycleStage): string {
  if (stage === "released") return "✔";
  if (stage === "archived") return "✘";
  if (stage === "building" || stage === "testing") return "⚙";
  return "…";
}

function printOpportunityLine(o: Opportunity): void {
  console.log(`${stageIcon(o.stage)} ${o.id}  [${o.stage}]  score=${o.score.overall.toFixed(2)}  ${o.title}`);
}

export function registerInnovationCommand(program: Command): void {
  const cmd = program
    .command("innovation")
    .description("Innovation Intelligence: continuously discovers opportunities worth building next");

  cmd
    .command("discover")
    .description("Run one discovery cycle: collect signals, update the knowledge graph, merge into opportunities")
    .option("-d, --domains <domains>", "comma-separated domains to restrict this cycle to (market,github,community,research,workflow,competitor)")
    .action(async (opts) => {
      const ashos = new AshOS();
      const domains = opts.domains ? (String(opts.domains).split(",") as IntelligenceDomain[]) : undefined;

      console.log("Running discovery cycle...");
      const { opportunities, signalCount } = await ashos.innovation.runDiscoveryCycle(domains);
      console.log(`\nCaptured ${signalCount} signal(s) across ${opportunities.length} opportunit${opportunities.length === 1 ? "y" : "ies"} total.`);
    });

  cmd
    .command("list")
    .description("List opportunities, highest-scoring first")
    .option("-l, --limit <n>", "max rows", (v) => parseInt(v, 10), 20)
    .option("-s, --stage <stage>", "filter by lifecycle stage")
    .action((opts) => {
      const ashos = new AshOS();
      const opportunities = opts.stage
        ? ashos.innovation.opportunities.byStage(opts.stage as IdeaLifecycleStage)
        : ashos.innovation.opportunities.topOpportunities(opts.limit);

      if (opportunities.length === 0) {
        console.log("No opportunities discovered yet. Run `ash innovation discover` to start.");
        return;
      }
      for (const o of opportunities.slice(0, opts.limit)) printOpportunityLine(o);
    });

  cmd
    .command("show <id>")
    .description("Show full detail for one opportunity: score, evidence, history")
    .action((id: string) => {
      const ashos = new AshOS();
      const opportunity = ashos.innovation.opportunities.get(id);
      if (!opportunity) {
        console.error(`Opportunity "${id}" not found.`);
        process.exitCode = 1;
        return;
      }

      console.log(`${opportunity.title}  [${opportunity.stage}]`);
      console.log(opportunity.problemStatement);
      console.log(`\nTags: ${opportunity.tags.join(", ") || "(none)"}`);
      console.log(`Domains: ${opportunity.domains.join(", ")}`);
      console.log(`Overall score: ${opportunity.score.overall.toFixed(2)}`);
      console.log(`\nEvidence (${opportunity.signals.length} signal(s)):`);
      for (const signal of opportunity.signals) console.log(`  - [${signal.kind}/${signal.source}] ${signal.title}`);
      console.log(`\nHistory:`);
      for (const entry of opportunity.history) console.log(`  ${entry.at} — ${entry.event}`);
    });

  cmd
    .command("brief")
    .description("Generate today's Daily Innovation Brief from current opportunities")
    .action(async () => {
      const ashos = new AshOS();
      const brief = await ashos.innovation.generateBrief();

      console.log(`Daily Innovation Brief — ${brief.generatedAt}`);
      console.log(brief.narrative);
      console.log(`\nTop opportunities:`);
      for (const o of brief.topOpportunities) printOpportunityLine(o);
    });

  cmd
    .command("profile")
    .description("Show the learned Builder Profile (which categories the recommendation engine favors)")
    .option("-l, --limit <n>", "max rows", (v) => parseInt(v, 10), 15)
    .action((opts) => {
      const ashos = new AshOS();
      const top = ashos.innovation.profile.topCategories(opts.limit);
      if (top.length === 0) {
        console.log("No builder profile yet — it builds up as `ash innovation discover` runs.");
        return;
      }
      for (const entry of top) console.log(`${entry.category}  weight=${entry.weight.toFixed(1)}  signals=${entry.signalCount}`);
    });

  cmd
    .command("collectors")
    .description("List registered collectors, one per intelligence domain by default")
    .action(() => {
      const ashos = new AshOS();
      for (const collector of ashos.innovation.collectors.list()) {
        console.log(`${collector.id} [${collector.domain}] — ${collector.description}`);
      }
    });
}
