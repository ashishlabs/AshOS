export type MaintenanceStatus = "active" | "maintained" | "stale" | "abandoned";

/**
 * Cached, structured analysis of one repository — the "Repository
 * Intelligence" deliverable. Real fields come straight from the GitHub API;
 * the four `*Score`/`*Potential` fields and `ashosCompatibility` are
 * transparent heuristics (documented in repository-analyst-agent.ts), not
 * an LLM judgment call, so they're deterministic and free to recompute.
 */
export interface RepositoryProfile {
  fullName: string;
  url: string;
  description: string | null;
  primaryLanguage: string | null;
  /** Bytes of code per language, from GitHub's /languages endpoint — the closest real signal to "architecture/technologies" without cloning the repo. */
  languages: Record<string, number>;
  topics: string[];
  license: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  watchers: number;
  contributors: number;
  /** Best-effort dependency names from package.json when the repo is JS/TS; empty for other ecosystems (documented gap, see docs/ashos-intelligence.md). */
  dependencies: string[];
  createdAt: string;
  pushedAt: string;
  maintenanceStatus: MaintenanceStatus;
  /** 0-1: recency + topic breadth + star momentum proxy. */
  innovationScore: number;
  /** 0-1: license present + active maintenance + issue-to-star ratio. */
  productionReadiness: number;
  /** 0-1: stars/forks relative to age — how quickly the community is adopting it. */
  adoptionPotential: number;
  /** Plain-English note on how easily this could integrate with AshOS's Node/TypeScript plugin surface. */
  ashosCompatibility: string;
  analyzedAt: string;
}
