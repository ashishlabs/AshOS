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
    .option("--live", "use every real collector (GitHub/HN/Reddit/arXiv/Hugging Face) instead of the offline mock collectors")
    .action(async (opts) => {
      const ashos = new AshOS();
      const domains = opts.domains ? (String(opts.domains).split(",") as IntelligenceDomain[]) : undefined;

      console.log(opts.live ? "Running live discovery across every real source..." : "Running discovery cycle...");
      const { opportunities, signalCount } = opts.live
        ? await ashos.innovation.runLiveDiscovery()
        : await ashos.innovation.runDiscoveryCycle(domains);
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
      for (const collector of ashos.innovation.liveCollectors) {
        console.log(`${collector.id} [${collector.domain}] (opt-in via --live) — ${collector.description}`);
      }
    });

  cmd
    .command("digest")
    .description("Run every real, opt-in collector (GitHub/HN/Reddit/arXiv/Hugging Face) and save today's AI news as a Markdown file")
    .option("-s, --sources <ids>", "comma-separated collector ids to restrict to (default: all live collectors)")
    .action(async (opts) => {
      const ashos = new AshOS();
      const sourceIds = opts.sources ? String(opts.sources).split(",") : undefined;

      console.log("Running live discovery across every real source...");
      const { markdown, path: filePath, result } = await ashos.innovation.generateDigest(sourceIds);
      const failed = result.sources.filter((s) => s.error).map((s) => s.id);

      console.log(`\nSaved ${filePath}`);
      console.log(`Captured ${result.signalCount} item(s) across ${result.sources.length} source(s)${failed.length ? ` (${failed.join(", ")} unavailable)` : ""}.\n`);
      console.log(markdown);
    });

  cmd
    .command("events")
    .description("List canonical, deduplicated events (the normalized layer between raw signals and opportunities)")
    .option("-l, --limit <n>", "max rows", (v) => parseInt(v, 10), 20)
    .option("-c, --category <category>", "filter by event category")
    .action((opts) => {
      const ashos = new AshOS();
      const list = opts.category ? ashos.innovation.events.byCategory(opts.category) : ashos.innovation.events.list();
      if (list.length === 0) {
        console.log("No events recorded yet. Run `ash innovation discover` to start.");
        return;
      }
      for (const event of list.slice(0, opts.limit)) {
        console.log(`[${event.category}] ${event.title}  (${event.occurrences} source${event.occurrences === 1 ? "" : "s"}, confidence=${event.confidence.toFixed(2)})`);
      }
    });

  const repo = cmd.command("repo").description("Repository Intelligence: structured, cached analysis of GitHub repositories");

  repo
    .command("analyze <fullName>")
    .description('Analyze a repository (e.g. "ollama/ollama") via the real GitHub API into a structured, cached profile')
    .action(async (fullName: string) => {
      const ashos = new AshOS();
      const result = await ashos.runAgent("repository-analyst", { description: `analyze ${fullName}`, input: { fullName } });
      if (!result.ok) {
        console.error(result.error);
        process.exitCode = 1;
        return;
      }
      console.log(result.output);
    });

  repo
    .command("list")
    .description("List every previously analyzed repository")
    .option("-l, --limit <n>", "max rows", (v) => parseInt(v, 10), 20)
    .action((opts) => {
      const ashos = new AshOS();
      const list = ashos.innovation.repositories.list();
      if (list.length === 0) {
        console.log('No repositories analyzed yet. Run `ash innovation repo analyze "owner/repo"` to start.');
        return;
      }
      for (const profile of list.slice(0, opts.limit)) {
        console.log(`${profile.fullName}  [${profile.maintenanceStatus}]  ${profile.stars}★  ${profile.license ?? "no license"}`);
      }
    });

  const idea = cmd.command("idea").description("Idea Lab: promote a captured idea (Inbox item or raw text) into a scored, deduped Opportunity");

  idea
    .command("capture [content...]")
    .description("Score and dedupe an idea into an Innovation Opportunity, reusing the same engine `ash innovation discover` uses")
    .option("-i, --inbox <id>", "promote an existing Inbox item instead of passing content directly")
    .option("-t, --tags <tags>", "comma-separated tags")
    .option("-d, --domain <domain>", "intelligence domain: market/github/community/research/workflow/competitor (defaults to workflow)")
    .action(async (content: string[], opts) => {
      const ashos = new AshOS();
      if (!opts.inbox && content.length === 0) {
        console.error("Provide idea content, or --inbox <id> to promote an existing Inbox item.");
        process.exitCode = 1;
        return;
      }
      const tags = opts.tags ? String(opts.tags).split(",").map((t: string) => t.trim()).filter(Boolean) : undefined;
      const result = await ashos.runAgent("idea", {
        description: "capture idea",
        input: {
          inboxId: opts.inbox,
          content: content.length ? content.join(" ") : undefined,
          tags,
          domain: opts.domain,
          mergeThreshold: ashos.kernel.config.innovation.mergeThreshold
        }
      });
      if (!result.ok) {
        console.error(result.error);
        process.exitCode = 1;
        return;
      }
      console.log(result.output);
    });

  cmd
    .command("radar")
    .description("Show (or refresh) the Technology Radar: emerging/growing/stable/declining/obsolete, with evidence")
    .option("-r, --refresh", "recompute the radar from the current knowledge graph before printing")
    .action(async (opts) => {
      const ashos = new AshOS();
      if (opts.refresh) {
        const result = await ashos.runAgent("technology-radar", { description: "refresh technology radar" });
        console.log(result.output);
        console.log();
      }
      const entries = ashos.innovation.radar.list();
      if (entries.length === 0) {
        console.log("No technologies tracked yet. Run `ash innovation discover` then `ash innovation radar --refresh`.");
        return;
      }
      for (const entry of entries) {
        console.log(`[${entry.ring}] ${entry.technology}  (${entry.evidence.totalMentions} mentions, ${entry.evidence.mentionsPerDay.toFixed(2)}/day)`);
      }
    });
}
