import { BaseAgent } from "../../agents/base-agent";
import type { AgentContext, AgentResult, AgentTask } from "../../agents/types";
import { RepositoryProfileStore } from "../repository/repository-profile-store";
import type { MaintenanceStatus, RepositoryProfile } from "../repository/types";

interface GitHubRepo {
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  topics?: string[];
  license: { name: string } | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  watchers_count: number;
  created_at: string;
  pushed_at: string;
}

const GITHUB_API = "https://api.github.com";
const DAY_MS = 24 * 60 * 60 * 1000;

function maintenanceStatus(pushedAt: string): MaintenanceStatus {
  const days = (Date.now() - new Date(pushedAt).getTime()) / DAY_MS;
  if (days <= 30) return "active";
  if (days <= 180) return "maintained";
  if (days <= 365) return "stale";
  return "abandoned";
}

/** Last page number from a paginated endpoint's `Link` header — the accurate way to count contributors without fetching every page. */
function lastPageFromLinkHeader(linkHeader: string | null): number | undefined {
  if (!linkHeader) return undefined;
  const match = linkHeader.match(/[?&]page=(\d+)>;\s*rel="last"/);
  return match ? parseInt(match[1], 10) : undefined;
}

function scoreInnovation(repo: GitHubRepo, topics: string[]): number {
  const ageDays = Math.max(1, (Date.now() - new Date(repo.created_at).getTime()) / DAY_MS);
  const starVelocity = repo.stargazers_count / ageDays;
  const aiRelated = topics.some((t) => ["ai", "llm", "agents", "ai-agents", "machine-learning", "artificial-intelligence"].includes(t));
  return Math.min(1, starVelocity / 20 + (aiRelated ? 0.3 : 0) + Math.min(0.2, topics.length / 25));
}

function scoreProductionReadiness(repo: GitHubRepo, status: MaintenanceStatus): number {
  let score = 0;
  if (repo.license) score += 0.3;
  if (status === "active" || status === "maintained") score += 0.3;
  const issueRatio = repo.open_issues_count / Math.max(1, repo.stargazers_count);
  if (issueRatio < 0.05) score += 0.2;
  if (repo.stargazers_count >= 1000) score += 0.2;
  return Math.min(1, score);
}

function scoreAdoptionPotential(repo: GitHubRepo): number {
  const ageDays = Math.max(1, (Date.now() - new Date(repo.created_at).getTime()) / DAY_MS);
  const combined = (repo.stargazers_count + repo.forks_count * 2) / ageDays;
  return Math.min(1, combined / 30);
}

function ashosCompatibility(language: string | null): string {
  const normalized = language?.toLowerCase();
  if (normalized === "typescript" || normalized === "javascript") {
    return "High — same runtime as AshOS; could be wrapped directly as a tool, provider, or agent dependency.";
  }
  if (normalized === "python") {
    return "Medium — would need a subprocess or HTTP bridge (same pattern as ShellTool) to call from AshOS.";
  }
  if (normalized) {
    return `Low — ${language} has no direct AshOS integration path today; would need a CLI/HTTP wrapper.`;
  }
  return "Unknown — no primary language reported.";
}

function integrationOpportunities(repo: GitHubRepo, topics: string[]): string[] {
  const ideas: string[] = [];
  if (topics.some((t) => ["cli", "command-line"].includes(t))) ideas.push("Could be wrapped as an AshOS tool (shells out to its CLI).");
  if (topics.some((t) => ["api", "sdk", "rest"].includes(t))) ideas.push("Could be wrapped as an AshOS provider or tool via its API/SDK.");
  if (topics.some((t) => ["agent", "agents", "ai-agents"].includes(t))) ideas.push("Relevant prior art for AshOS's agents/ package — worth studying its task/tool abstractions.");
  if (topics.some((t) => ["mcp", "mcp-server"].includes(t))) ideas.push("Speaks MCP — could plug into AshOS's plugin surface with a thin adapter.");
  if (ideas.length === 0) ideas.push("No obvious direct integration path from topics alone — needs a closer read of the README.");
  return ideas;
}

/**
 * Produces structured `RepositoryProfile` knowledge for one repository from
 * real GitHub API data — the "Repository Intelligence" deliverable. Always
 * makes one cheap call (`GET /repos/{fullName}`) to check whether anything
 * changed since the last analysis; only pays for the expensive calls
 * (languages, contributors, package.json) when the repo's `pushed_at`
 * fingerprint actually moved, so re-running analysis on an unchanged repo
 * is nearly free.
 */
export class RepositoryAnalystAgent extends BaseAgent {
  name = "repository-analyst";
  description = "Analyzes a GitHub repository into a structured, cached RepositoryProfile (architecture, maintenance, scores, AshOS fit)";
  capabilities = ["repository-analyst", "repository-intelligence"];

  async run(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const fullName = task.input?.fullName as string | undefined;
    if (!fullName) return { ok: false, error: "repository-analyst requires task.input.fullName, e.g. \"owner/repo\"" };

    const store = new RepositoryProfileStore(context.cwd);

    let repo: GitHubRepo;
    try {
      const res = await fetch(`${GITHUB_API}/repos/${fullName}`, { headers: { accept: "application/vnd.github+json", "user-agent": "AshOS" } });
      if (!res.ok) return { ok: false, error: `GitHub returned ${res.status} for repos/${fullName}` };
      repo = (await res.json()) as GitHubRepo;
    } catch (error) {
      return { ok: false, error: `GitHub API unreachable: ${(error as Error).message}` };
    }

    const cached = store.get(fullName);
    if (cached && cached.pushedAt === repo.pushed_at) {
      return { ok: true, output: `Using cached analysis for ${fullName} (unchanged since ${repo.pushed_at}).`, data: { profile: cached, cached: true } };
    }

    const topics = repo.topics ?? [];
    const [languages, contributors] = await Promise.all([this.fetchLanguages(fullName), this.fetchContributorCount(fullName)]);
    const dependencies = await this.fetchDependencies(fullName);
    const status = maintenanceStatus(repo.pushed_at);

    const profile: RepositoryProfile = {
      fullName: repo.full_name,
      url: repo.html_url,
      description: repo.description,
      primaryLanguage: repo.language,
      languages,
      topics,
      license: repo.license?.name ?? null,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      openIssues: repo.open_issues_count,
      watchers: repo.watchers_count,
      contributors,
      dependencies,
      createdAt: repo.created_at,
      pushedAt: repo.pushed_at,
      maintenanceStatus: status,
      innovationScore: scoreInnovation(repo, topics),
      productionReadiness: scoreProductionReadiness(repo, status),
      adoptionPotential: scoreAdoptionPotential(repo),
      ashosCompatibility: ashosCompatibility(repo.language),
      analyzedAt: new Date().toISOString()
    };

    store.save(profile);
    context.eventBus?.emit("innovation:repository-analyzed", { fullName: profile.fullName });

    const opportunities = integrationOpportunities(repo, topics);
    return {
      ok: true,
      output: `${profile.fullName}: ${status}, ${profile.stars}★, ${profile.license ?? "no license"}. ${opportunities[0]}`,
      data: { profile, cached: false, integrationOpportunities: opportunities }
    };
  }

  private async fetchLanguages(fullName: string): Promise<Record<string, number>> {
    try {
      const res = await fetch(`${GITHUB_API}/repos/${fullName}/languages`, { headers: { accept: "application/vnd.github+json", "user-agent": "AshOS" } });
      if (!res.ok) return {};
      return (await res.json()) as Record<string, number>;
    } catch {
      return {};
    }
  }

  private async fetchContributorCount(fullName: string): Promise<number> {
    try {
      const res = await fetch(`${GITHUB_API}/repos/${fullName}/contributors?per_page=1&anon=true`, {
        headers: { accept: "application/vnd.github+json", "user-agent": "AshOS" }
      });
      if (!res.ok) return 0;
      const fromHeader = lastPageFromLinkHeader(res.headers.get("link"));
      if (fromHeader) return fromHeader;
      const body = (await res.json()) as unknown[];
      return body.length;
    } catch {
      return 0;
    }
  }

  /** Best-effort dependency names from package.json — only meaningful for JS/TS repos; empty (not an error) for everything else. */
  private async fetchDependencies(fullName: string): Promise<string[]> {
    try {
      const res = await fetch(`${GITHUB_API}/repos/${fullName}/contents/package.json`, {
        headers: { accept: "application/vnd.github+json", "user-agent": "AshOS" }
      });
      if (!res.ok) return [];
      const body = (await res.json()) as { content?: string; encoding?: string };
      if (!body.content || body.encoding !== "base64") return [];
      const pkg = JSON.parse(Buffer.from(body.content, "base64").toString("utf-8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    } catch {
      return [];
    }
  }
}
