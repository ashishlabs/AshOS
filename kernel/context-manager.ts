import fs from "node:fs";
import path from "node:path";

export interface ProjectContext {
  root: string;
  name: string;
  gitRepo: boolean;
  packageManager: "npm" | "pnpm" | "yarn" | "unknown";
}

/**
 * Tracks "where am I / what am I working on" for the current session:
 * project root, active files, detected tooling. Agents and the planner read
 * this to ground prompts instead of asking the user to repeat context.
 */
export class ContextManager {
  private activeFiles = new Set<string>();
  private notes: string[] = [];

  constructor(private cwd: string = process.cwd()) {}

  detectProject(): ProjectContext {
    let dir = this.cwd;
    while (dir !== path.parse(dir).root) {
      if (fs.existsSync(path.join(dir, "package.json")) || fs.existsSync(path.join(dir, ".git"))) {
        break;
      }
      dir = path.dirname(dir);
    }

    const packageJsonPath = path.join(dir, "package.json");
    let name = path.basename(dir);
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        name = pkg.name ?? name;
      } catch {
        // ignore malformed package.json
      }
    }

    let packageManager: ProjectContext["packageManager"] = "unknown";
    if (fs.existsSync(path.join(dir, "pnpm-lock.yaml"))) packageManager = "pnpm";
    else if (fs.existsSync(path.join(dir, "yarn.lock"))) packageManager = "yarn";
    else if (fs.existsSync(path.join(dir, "package-lock.json"))) packageManager = "npm";

    return {
      root: dir,
      name,
      gitRepo: fs.existsSync(path.join(dir, ".git")),
      packageManager
    };
  }

  addActiveFile(filePath: string): void {
    this.activeFiles.add(filePath);
  }

  removeActiveFile(filePath: string): void {
    this.activeFiles.delete(filePath);
  }

  getActiveFiles(): string[] {
    return [...this.activeFiles];
  }

  addNote(note: string): void {
    this.notes.push(note);
  }

  getNotes(): string[] {
    return [...this.notes];
  }
}
