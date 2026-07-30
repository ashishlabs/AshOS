import type { AIProvider } from "../../providers/types";
import type { Mutation } from "../mutation/types";
import type { Hypothesis, SystemSnapshot } from "./types";

const PROMPT_PREAMBLE = `You are improving AshOS.

Study the current implementation.

Find one small change likely to improve quality, latency, robustness, maintainability or token efficiency.

Do NOT make unrelated changes.

Return ONLY valid JSON, no prose, no markdown fences, matching this exact shape:
{
  "summary": "one-sentence hypothesis",
  "filesToModify": ["path/to/file.ts"],
  "implementationPlan": "exact implementation plan",
  "expectedImpact": "expected impact",
  "risks": "risks",
  "benchmarkStrategy": "benchmark strategy",
  "mutationId": "must be exactly one of the registered mutation ids listed below",
  "mutationParams": {}
}`;

function buildSystemPrompt(mutations: Mutation[]): string {
  const mutationList = mutations.map((m) => `- ${m.id} (${m.targetKind}): ${m.description}`).join("\n");
  return `${PROMPT_PREAMBLE}\n\nRegistered mutations you may choose "mutationId" from:\n${mutationList}`;
}

function buildContextMessage(snapshot: SystemSnapshot): string {
  return [
    `Active provider: ${snapshot.activeProvider}`,
    `Registered benchmarks: ${snapshot.registeredBenchmarks.join(", ") || "(none)"}`,
    `Most recent benchmark scores: ${JSON.stringify(snapshot.recentBenchmarkScores)}`,
    `Recent system activity (most recent last):`,
    ...snapshot.recentActivity.map((line) => `  ${line}`)
  ].join("\n");
}

/**
 * "Generate hypothesis": prompts the configured research provider (LM
 * Studio + Gemma by default, but any registered AIProvider works) with the
 * exact improvement-proposal template, and parses the response into a
 * structured Hypothesis tied to one of the currently registered mutations.
 * Never hard-fails: an unparseable or errored response falls back to a
 * safe, low-risk hypothesis so a cycle never crashes on a bad LLM response.
 */
export class Researcher {
  constructor(private readonly provider: AIProvider) {}

  async propose(snapshot: SystemSnapshot, mutations: Mutation[]): Promise<Hypothesis> {
    if (mutations.length === 0) {
      throw new Error("Researcher.propose: no mutations are registered to choose from");
    }

    let raw: string;
    try {
      const result = await this.provider.chat(
        [
          { role: "system", content: buildSystemPrompt(mutations) },
          { role: "user", content: buildContextMessage(snapshot) }
        ],
        { temperature: 0.4 }
      );
      raw = result.content;
    } catch (error) {
      return this.fallback(mutations, `research provider error: ${(error as Error).message}`);
    }

    return this.parse(raw, mutations) ?? this.fallback(mutations, "research provider returned unparseable output");
  }

  private parse(raw: string, mutations: Mutation[]): Hypothesis | undefined {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try {
      const data = JSON.parse(match[0]) as Partial<Hypothesis> & { mutationId?: string };
      const validIds = new Set(mutations.map((m) => m.id));
      const mutationId = data.mutationId && validIds.has(data.mutationId) ? data.mutationId : mutations[0].id;

      return {
        summary: data.summary ?? "unnamed hypothesis",
        filesToModify: Array.isArray(data.filesToModify) ? data.filesToModify : [],
        implementationPlan: data.implementationPlan ?? "",
        expectedImpact: data.expectedImpact ?? "",
        risks: data.risks ?? "",
        benchmarkStrategy: data.benchmarkStrategy ?? "",
        mutationId,
        mutationParams: data.mutationParams && typeof data.mutationParams === "object" ? data.mutationParams : undefined
      };
    } catch {
      return undefined;
    }
  }

  private fallback(mutations: Mutation[], reason: string): Hypothesis {
    const mutation = mutations[0];
    return {
      summary: `Fallback hypothesis (${reason}): try the first registered mutation with its default parameters.`,
      filesToModify: [],
      implementationPlan: "Apply the mutation with default parameters and benchmark the result.",
      expectedImpact: "Unknown — generated without a parseable research response.",
      risks: "Low: the mutation is reversible and gated by the standard accept/reject pipeline.",
      benchmarkStrategy: "Run all registered benchmarks and compare against the current baseline.",
      mutationId: mutation.id,
      mutationParams: undefined
    };
  }
}
