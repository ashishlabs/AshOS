import fs from "node:fs";
import path from "node:path";
import type { AppliedMutation, FileSnapshot, MutationContext } from "./types";

export function snapshotFile(workspaceRoot: string, relativePath: string): FileSnapshot {
  const abs = path.join(workspaceRoot, relativePath);
  const originalContent = fs.existsSync(abs) ? fs.readFileSync(abs, "utf-8") : null;
  return { filePath: relativePath, originalContent };
}

export function writeFile(workspaceRoot: string, relativePath: string, content: string): void {
  const abs = path.join(workspaceRoot, relativePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

/** Restores every snapshotted file to its pre-mutation content, deleting it if it didn't exist before. */
export function revertSnapshots(workspaceRoot: string, snapshots: FileSnapshot[]): void {
  for (const snap of snapshots) {
    const abs = path.join(workspaceRoot, snap.filePath);
    if (snap.originalContent === null) {
      if (fs.existsSync(abs)) fs.rmSync(abs);
    } else {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, snap.originalContent);
    }
  }
}

/** Snapshots a file, replaces the first occurrence of `find` with `replace`, and writes it back. */
export function applyFindReplace(
  context: MutationContext,
  mutationId: string,
  relativePath: string,
  find: string,
  replace: string
): AppliedMutation {
  const snapshot = snapshotFile(context.workspaceRoot, relativePath);
  if (snapshot.originalContent === null) {
    throw new Error(`mutation "${mutationId}": file "${relativePath}" does not exist in workspace`);
  }
  if (!snapshot.originalContent.includes(find)) {
    throw new Error(`mutation "${mutationId}": pattern not found in "${relativePath}"`);
  }
  const patched = snapshot.originalContent.replace(find, replace);
  writeFile(context.workspaceRoot, relativePath, patched);
  return {
    mutationId,
    params: { filePath: relativePath, find, replace },
    filesChanged: [relativePath],
    snapshots: [snapshot],
    summary: `Patched ${relativePath}`
  };
}
