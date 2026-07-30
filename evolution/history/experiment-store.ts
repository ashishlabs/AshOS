import fs from "node:fs";
import path from "node:path";
import type { ExperimentRecord } from "./types";

/** JSON-file-backed persistence for experiment records — mirrors MemoryManager's on-disk convention. */
export class ExperimentStore {
  constructor(private readonly root: string) {}

  private dir(): string {
    return path.join(this.root, ".ashos", "evolution", "experiments");
  }

  private file(id: string): string {
    return path.join(this.dir(), `${id}.json`);
  }

  save(record: ExperimentRecord): void {
    fs.mkdirSync(this.dir(), { recursive: true });
    fs.writeFileSync(this.file(record.id), JSON.stringify(record, null, 2));
  }

  get(id: string): ExperimentRecord | undefined {
    try {
      return JSON.parse(fs.readFileSync(this.file(id), "utf-8")) as ExperimentRecord;
    } catch {
      return undefined;
    }
  }

  list(): ExperimentRecord[] {
    if (!fs.existsSync(this.dir())) return [];
    return fs
      .readdirSync(this.dir())
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(this.dir(), f), "utf-8")) as ExperimentRecord)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Most recent completed experiment's metrics, used as the running baseline for new comparisons. */
  latestBaseline(): ExperimentRecord | undefined {
    return this.list().find((r) => r.status === "completed" && r.metrics);
  }

  /** Highest-scoring accepted experiments, most recent tie-break first. */
  leaderboard(limit = 10): ExperimentRecord[] {
    return this.list()
      .filter((r) => r.result === "accepted" && r.metrics)
      .sort((a, b) => b.metrics!.weightedOverallScore - a.metrics!.weightedOverallScore)
      .slice(0, limit);
  }

  acceptanceRate(): number {
    const decided = this.list().filter((r) => r.result === "accepted" || r.result === "rejected");
    if (decided.length === 0) return 0;
    return decided.filter((r) => r.result === "accepted").length / decided.length;
  }
}
