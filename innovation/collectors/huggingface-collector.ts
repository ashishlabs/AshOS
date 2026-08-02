import type { Signal } from "../types";
import type { Collector } from "./types";

interface HfModel {
  id: string;
  likes?: number;
  downloads?: number;
  pipeline_tag?: string;
  tags?: string[];
  lastModified?: string;
}

const HF_MODELS_URL = "https://huggingface.co/api/models";

export interface HuggingFaceCollectorOptions {
  limit?: number;
}

/**
 * Real, network-backed collector for Hugging Face's public model listing API
 * — trending models, no auth required for read access. Same opt-in
 * convention as `github-releases-collector.ts` — never registered on
 * `CollectorRegistry`, only reachable via `InnovationModule.runLiveDiscovery()`.
 */
export function createHuggingFaceCollector(options: HuggingFaceCollectorOptions = {}): Collector {
  const limit = options.limit ?? 10;

  return {
    id: "huggingface-live",
    domain: "research",
    description: "Real Hugging Face API collector: trending model releases.",
    async collect(): Promise<Signal[]> {
      const observedAt = new Date().toISOString();
      const url = `${HF_MODELS_URL}?sort=trendingScore&direction=-1&limit=${limit}`;

      try {
        const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "AshOS" } });
        if (!res.ok) return [];
        const models = (await res.json()) as HfModel[];

        return models
          .filter((m) => m.id)
          .map((model) => ({
            id: `huggingface-live-${model.id}`,
            domain: "research" as const,
            kind: "model-release" as const,
            source: "huggingface:models-api",
            title: model.id,
            summary: `${model.pipeline_tag ?? "model"} — ${model.likes ?? 0} like(s), ${model.downloads ?? 0} download(s).`,
            url: `https://huggingface.co/${model.id}`,
            tags: [model.pipeline_tag, ...(model.tags ?? [])].filter((t): t is string => Boolean(t)).map((t) => t.toLowerCase()),
            confidence: Math.min(0.9, 0.4 + (model.likes ?? 0) / 2000),
            observedAt,
            raw: model
          }));
      } catch {
        return [];
      }
    }
  };
}
