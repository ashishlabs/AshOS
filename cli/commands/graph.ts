import { Command } from "commander";
import { AshOS } from "../../sdk/ashos";
import type { KnowledgeNodeKind } from "../../graph/types";

export function registerGraphCommand(program: Command): void {
  const cmd = program.command("graph").description("General Knowledge Graph: how projects, agents, and tasks connect (distinct from `ash innovation`'s own graph)");

  cmd
    .command("stats")
    .description("Show node/edge counts, grouped by kind")
    .action(() => {
      const ashos = new AshOS();
      const stats = ashos.knowledgeGraph.stats();
      console.log(`${stats.nodeCount} node(s), ${stats.edgeCount} edge(s)`);
      for (const [kind, count] of Object.entries(stats.byKind)) console.log(`  ${kind}: ${count}`);
    });

  cmd
    .command("nodes")
    .description("List nodes, optionally filtered by kind")
    .option("-k, --kind <kind>", 'filter by node kind, e.g. "project", "agent", "task"')
    .action((opts) => {
      const ashos = new AshOS();
      const nodes = ashos.knowledgeGraph.listNodes(opts.kind ? { kind: opts.kind as KnowledgeNodeKind } : undefined);
      if (nodes.length === 0) {
        console.log("No nodes recorded yet — nodes are created automatically as agents run.");
        return;
      }
      for (const node of nodes) console.log(`[${node.kind}] ${node.id}  ${node.label}`);
    });

  cmd
    .command("neighbors <id>")
    .description("Show every node directly connected to the given node id")
    .action((id: string) => {
      const ashos = new AshOS();
      const neighbors = ashos.knowledgeGraph.neighbors(id);
      if (neighbors.length === 0) {
        console.log(`No neighbors found for "${id}" (check the id with \`ash graph nodes\`).`);
        return;
      }
      for (const { node, edge } of neighbors) console.log(`--${edge.kind}(${edge.weight})--> [${node.kind}] ${node.label}`);
    });
}
