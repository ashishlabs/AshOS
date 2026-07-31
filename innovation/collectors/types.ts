import type { IntelligenceDomain } from "../../kernel/config";
import type { Signal } from "../types";

/**
 * Pluggable signal source for one Innovation Intelligence domain. Ships with
 * one deterministic offline implementation per domain (`mock-collector.ts`,
 * the default — same "offline by default" convention as `providers/mock-provider.ts`);
 * a real collector (GitHub trending, Hacker News/Reddit, arXiv, ...) is just
 * another object implementing this interface, registered via
 * `CollectorRegistry.register`, exactly like a provider factory or a tool.
 */
export interface Collector {
  id: string;
  domain: IntelligenceDomain;
  description: string;
  collect(): Promise<Signal[]>;
}
