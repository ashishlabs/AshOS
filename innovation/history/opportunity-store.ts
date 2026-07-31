import fs from "node:fs";
import path from "node:path";
import type { IdeaLifecycleStage, Opportunity } from "../types";

/** JSON-file-per-opportunity persistence. */
export class OpportunityStore {
  constructor(private readonly root: string) {}

  private dir(): string {
    return path.join(this.root, ".ashos", "innovation", "opportunities");
  }

  private file(id: string): string {
    return path.join(this.dir(), `${id}.json`);
  }

  save(opportunity: Opportunity): void {
    fs.mkdirSync(this.dir(), { recursive: true });
    fs.writeFileSync(this.file(opportunity.id), JSON.stringify(opportunity, null, 2));
  }

  get(id: string): Opportunity | undefined {
    try {
      return JSON.parse(fs.readFileSync(this.file(id), "utf-8")) as Opportunity;
    } catch {
      return undefined;
    }
  }

  /** All opportunities, most recently updated first. */
  list(): Opportunity[] {
    if (!fs.existsSync(this.dir())) return [];
    return fs
      .readdirSync(this.dir())
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(this.dir(), f), "utf-8")) as Opportunity)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  byStage(stage: IdeaLifecycleStage): Opportunity[] {
    return this.list().filter((o) => o.stage === stage);
  }

  /** Highest-scoring opportunities, most recent tie-break first. */
  topOpportunities(limit = 10): Opportunity[] {
    return this.list()
      .sort((a, b) => b.score.overall - a.score.overall)
      .slice(0, limit);
  }
}
