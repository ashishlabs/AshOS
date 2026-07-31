import type { IntelligenceDomain } from "../../kernel/config";
import { CollectorRegistry } from "../collectors/registry";
import { createMockCollector, DEFAULT_MOCK_SEEDS } from "../collectors/mock-collector";
import { IntelligenceAgent } from "./intelligence-agent";

export const INTELLIGENCE_DOMAINS: IntelligenceDomain[] = ["market", "github", "community", "research", "workflow", "competitor"];

/** Pre-registers one mock collector per domain and builds the corresponding IntelligenceAgent for each. */
export function createDefaultIntelligenceAgents(collectors: CollectorRegistry): IntelligenceAgent[] {
  for (const domain of INTELLIGENCE_DOMAINS) {
    collectors.register(createMockCollector(domain, DEFAULT_MOCK_SEEDS[domain]));
  }
  return INTELLIGENCE_DOMAINS.map((domain) => new IntelligenceAgent({ domain, collectors }));
}

export { IntelligenceAgent } from "./intelligence-agent";
export { CollectorRegistry } from "../collectors/registry";
