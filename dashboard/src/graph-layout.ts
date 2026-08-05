export interface LayoutNode {
  id: string;
}
export interface LayoutEdge {
  from: string;
  to: string;
}
export interface LayoutPosition {
  x: number;
  y: number;
}

/**
 * A small, dependency-free force-directed layout (Fruchterman-Reingold
 * style: repulsion between every pair of nodes, spring attraction along
 * edges, simulated-annealing cooling) — deliberately hand-rolled instead
 * of adding d3-force/react-flow/cytoscape as a dependency, the same
 * "no vendor SDK where a small transparent implementation will do"
 * convention as `codebase/indexer.ts`'s regex symbol extraction.
 *
 * Deterministic: nodes start on a circle (not randomly placed), so the
 * same graph data always settles into the same layout across renders/
 * reloads instead of jittering. Not built for very large graphs — O(n²)
 * per iteration — fine for the tens-to-low-hundreds of nodes a single
 * project's Knowledge Graph accumulates.
 */
export function computeForceLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  opts: { width?: number; height?: number; iterations?: number } = {}
): Map<string, LayoutPosition> {
  const width = opts.width ?? 800;
  const height = opts.height ?? 600;
  const iterations = opts.iterations ?? 200;
  const centerX = width / 2;
  const centerY = height / 2;
  const positions = new Map<string, LayoutPosition>();
  const n = nodes.length;
  if (n === 0) return positions;

  const radius = Math.min(width, height) / 2.5;
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / n;
    positions.set(node.id, { x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) });
  });

  const idealEdgeLength = Math.min(width, height) / Math.max(4, Math.sqrt(n));
  const repulsionStrength = idealEdgeLength * idealEdgeLength * 0.8;
  const validEdges = edges.filter((e) => positions.has(e.from) && positions.has(e.to) && e.from !== e.to);

  for (let iter = 0; iter < iterations; iter++) {
    const cooling = 1 - iter / iterations;
    const forces = new Map<string, LayoutPosition>();
    for (const node of nodes) forces.set(node.id, { x: 0, y: 0 });

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i].id;
        const b = nodes[j].id;
        const pa = positions.get(a)!;
        const pb = positions.get(b)!;
        const dx = pa.x - pb.x;
        const dy = pa.y - pb.y;
        const distSq = Math.max(dx * dx + dy * dy, 0.01);
        const dist = Math.sqrt(distSq);
        const force = repulsionStrength / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const fa = forces.get(a)!;
        const fb = forces.get(b)!;
        fa.x += fx;
        fa.y += fy;
        fb.x -= fx;
        fb.y -= fy;
      }
    }

    for (const edge of validEdges) {
      const pa = positions.get(edge.from)!;
      const pb = positions.get(edge.to)!;
      const dx = pa.x - pb.x;
      const dy = pa.y - pb.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
      const force = (dist - idealEdgeLength) * 0.05;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      const fa = forces.get(edge.from)!;
      const fb = forces.get(edge.to)!;
      fa.x -= fx;
      fa.y -= fy;
      fb.x += fx;
      fb.y += fy;
    }

    const maxStep = 20 * cooling + 0.5;
    for (const node of nodes) {
      const p = positions.get(node.id)!;
      const f = forces.get(node.id)!;
      f.x += (centerX - p.x) * 0.01;
      f.y += (centerY - p.y) * 0.01;
      const stepX = Math.max(-maxStep, Math.min(maxStep, f.x * cooling));
      const stepY = Math.max(-maxStep, Math.min(maxStep, f.y * cooling));
      p.x = Math.max(30, Math.min(width - 30, p.x + stepX));
      p.y = Math.max(30, Math.min(height - 30, p.y + stepY));
    }
  }

  return positions;
}

/** Deterministic string -> HSL color, so every `KnowledgeNodeKind` (including ones added later) gets a stable, distinct-enough color with no hardcoded palette to keep in sync. */
export function kindColor(kind: string): string {
  let hash = 0;
  for (let i = 0; i < kind.length; i++) hash = (hash * 31 + kind.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360}, 65%, 55%)`;
}
