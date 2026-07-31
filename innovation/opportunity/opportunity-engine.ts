import { randomUUID } from "node:crypto";
import type { BuilderProfile, Opportunity, Signal } from "../types";
import type { ScoringEngine } from "./scoring";

export interface OpportunityEngineOptions {
  scoring: ScoringEngine;
  /** Jaccard tag-overlap threshold (0-1) above which a new signal is merged into an existing opportunity instead of creating a new one. */
  mergeThreshold: number;
}

export interface IngestResult {
  opportunity: Opportunity;
  opportunities: Opportunity[];
  created: boolean;
}

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  const intersection = [...setA].filter((tag) => setB.has(tag));
  return intersection.length / union.size;
}

/**
 * The "heart of the system": every discovered Signal either strengthens an
 * existing Opportunity (same underlying problem observed from a different
 * angle — a GitHub issue, then a Reddit complaint, then a competitor gap)
 * or seeds a new one. Similarity is a simple, explainable tag-overlap
 * (Jaccard) heuristic — deliberately not an LLM call, so merging stays fast,
 * deterministic and cheap to run every discovery cycle; `mergeThreshold` is
 * the one knob to retune.
 */
export class OpportunityEngine {
  constructor(private readonly opts: OpportunityEngineOptions) {}

  ingest(opportunities: Opportunity[], signal: Signal, profile?: BuilderProfile): IngestResult {
    const match = this.findBestMatch(opportunities, signal);

    if (!match) {
      const now = new Date().toISOString();
      const opportunity: Opportunity = {
        id: randomUUID(),
        title: signal.title,
        problemStatement: signal.summary,
        tags: [...signal.tags],
        domains: [signal.domain],
        signals: [signal],
        score: this.opts.scoring.score([signal], profile),
        stage: "captured",
        createdAt: now,
        updatedAt: now,
        history: [{ at: now, event: `captured from signal: ${signal.title}` }]
      };
      return { opportunity, opportunities: [...opportunities, opportunity], created: true };
    }

    const merged = this.merge(match, signal, profile);
    return {
      opportunity: merged,
      opportunities: opportunities.map((o) => (o.id === merged.id ? merged : o)),
      created: false
    };
  }

  private findBestMatch(opportunities: Opportunity[], signal: Signal): Opportunity | undefined {
    let best: { opportunity: Opportunity; similarity: number } | undefined;
    for (const opportunity of opportunities) {
      const similarity = jaccard(opportunity.tags, signal.tags);
      if (similarity >= this.opts.mergeThreshold && (!best || similarity > best.similarity)) {
        best = { opportunity, similarity };
      }
    }
    return best?.opportunity;
  }

  private merge(opportunity: Opportunity, signal: Signal, profile?: BuilderProfile): Opportunity {
    if (opportunity.signals.some((s) => s.id === signal.id)) return opportunity;

    const now = new Date().toISOString();
    const signals = [...opportunity.signals, signal];
    return {
      ...opportunity,
      tags: [...new Set([...opportunity.tags, ...signal.tags])],
      domains: [...new Set([...opportunity.domains, signal.domain])],
      signals,
      score: this.opts.scoring.score(signals, profile),
      updatedAt: now,
      history: [...opportunity.history, { at: now, event: `merged signal: ${signal.title}` }]
    };
  }
}
