import { describe, expect, it } from "vitest";
import { DailyBriefGenerator } from "./daily-brief";
import { MockProvider } from "../../providers/mock-provider";
import type { AIProvider } from "../../providers/types";
import type { Opportunity } from "../types";

class ThrowingProvider implements AIProvider {
  name(): string {
    return "throwing";
  }
  async chat(): Promise<never> {
    throw new Error("provider down");
  }
  async *stream(): AsyncGenerator<{ delta: string; done: boolean }> {
    throw new Error("provider down");
  }
  async embeddings(): Promise<number[]> {
    return [];
  }
  functionCalling(): boolean {
    return false;
  }
  maxContext(): number {
    return 0;
  }
  supportsVision(): boolean {
    return false;
  }
}

function opportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? "opp-1",
    title: overrides.title ?? "Opportunity",
    problemStatement: "problem",
    tags: [],
    domains: ["market"],
    signals: [],
    score: { overall: 0.5 } as Opportunity["score"],
    stage: "captured",
    createdAt: now,
    updatedAt: now,
    history: [],
    ...overrides
  };
}

describe("DailyBriefGenerator", () => {
  it("says there's nothing yet when there are no opportunities", async () => {
    const brief = await new DailyBriefGenerator().generate([], 0);
    expect(brief.topOpportunities).toHaveLength(0);
    expect(brief.narrative).toMatch(/no opportunities discovered yet/i);
  });

  it("ranks topOpportunities by score.overall and caps at `size`", async () => {
    const opportunities = [
      opportunity({ id: "a", score: { overall: 0.3 } as never }),
      opportunity({ id: "b", score: { overall: 0.9 } as never }),
      opportunity({ id: "c", score: { overall: 0.6 } as never })
    ];
    const brief = await new DailyBriefGenerator().generate(opportunities, 5, { size: 2 });

    expect(brief.topOpportunities.map((o) => o.id)).toEqual(["b", "c"]);
  });

  it("uses the provider for a narrative when one is given", async () => {
    const brief = await new DailyBriefGenerator().generate([opportunity()], 1, { provider: new MockProvider() });
    expect(brief.narrative).toContain("mock");
  });

  it("falls back to a plain narrative when no provider is given or the provider fails", async () => {
    const noProvider = await new DailyBriefGenerator().generate([opportunity({ title: "Widget" })], 1);
    expect(noProvider.narrative).toContain("Widget");

    const failingProvider = await new DailyBriefGenerator().generate([opportunity({ title: "Widget" })], 1, { provider: new ThrowingProvider() });
    expect(failingProvider.narrative).toContain("Widget");
  });

  it("collects the union of domains covered by the top opportunities", async () => {
    const opportunities = [
      opportunity({ id: "a", domains: ["market"], score: { overall: 0.9 } as never }),
      opportunity({ id: "b", domains: ["github", "community"], score: { overall: 0.8 } as never })
    ];
    const brief = await new DailyBriefGenerator().generate(opportunities, 0);
    expect(brief.domainsCovered.sort()).toEqual(["community", "github", "market"].sort());
  });
});
