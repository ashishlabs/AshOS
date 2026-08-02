import fs from "node:fs";
import path from "node:path";
import type { CodebaseIndex } from "./types";

/** JSON-per-repository cache, same pattern as `innovation/repository/repository-profile-store.ts` — one file per indexed root, keyed by a filesystem-safe slug of the absolute path. */
export class CodebaseIndexStore {
  constructor(private readonly root: string) {}

  private dir(): string {
    return path.join(this.root, ".ashos", "codebase");
  }

  slug(indexedRoot: string): string {
    return path.resolve(indexedRoot).replace(/[\\/:]/g, "_");
  }

  private file(indexedRoot: string): string {
    return path.join(this.dir(), `${this.slug(indexedRoot)}.json`);
  }

  save(index: CodebaseIndex): void {
    fs.mkdirSync(this.dir(), { recursive: true });
    fs.writeFileSync(this.file(index.root), JSON.stringify(index, null, 2));
  }

  get(indexedRoot: string): CodebaseIndex | undefined {
    const file = this.file(indexedRoot);
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as CodebaseIndex;
  }

  list(): CodebaseIndex[] {
    if (!fs.existsSync(this.dir())) return [];
    return fs
      .readdirSync(this.dir())
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(this.dir(), f), "utf-8")) as CodebaseIndex);
  }
}
