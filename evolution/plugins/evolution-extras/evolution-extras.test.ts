import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { plugin } from "./index";
import { MutationRegistry } from "../../mutation/registry";
import { BenchmarkRegistry } from "../../benchmark/registry";

const REPO_ROOT = path.resolve(__dirname, "../../..");

function seedWorkspace(workspaceRoot: string, relativePath: string): void {
  const src = path.join(REPO_ROOT, relativePath);
  const dest = path.join(workspaceRoot, relativePath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

describe("evolution-extras reference plugin", () => {
  it("registers its mutation and benchmark on the given registries", () => {
    const mutations = new MutationRegistry();
    const benchmarks = new BenchmarkRegistry();
    // Only the `evolution` registries this plugin touches are needed for this test.
    plugin.register({ evolution: { mutations, benchmarks } } as never);

    expect(mutations.get("comment-strip")).toBeDefined();
    expect(benchmarks.get("documentation-summary")).toBeDefined();
  });

  describe("comment-strip mutation", () => {
    let workspaceRoot: string;

    beforeEach(() => {
      workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-evo-extras-"));
    });

    afterEach(() => {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    });

    const TARGET_FILE = "kernel/context-manager.ts";

    it("removes comment-only lines and reverts to the exact original file", async () => {
      const mutations = new MutationRegistry();
      const benchmarks = new BenchmarkRegistry();
      plugin.register({ evolution: { mutations, benchmarks } } as never);
      const mutation = mutations.get("comment-strip")!;

      seedWorkspace(workspaceRoot, TARGET_FILE);
      const context = { workspaceRoot };
      const original = fs.readFileSync(path.join(workspaceRoot, TARGET_FILE), "utf-8");
      expect(original.split("\n").some((line) => line.trim().startsWith("//"))).toBe(true);

      const applied = await mutation.apply(context, { filePath: TARGET_FILE });
      const mutated = fs.readFileSync(path.join(workspaceRoot, TARGET_FILE), "utf-8");
      expect(mutated.split("\n").some((line) => line.trim().startsWith("//"))).toBe(false);
      expect(mutated.length).toBeLessThan(original.length);

      await mutation.revert(context, applied);
      expect(fs.readFileSync(path.join(workspaceRoot, TARGET_FILE), "utf-8")).toBe(original);
    });

    it("throws a clear error when the target file does not exist in the workspace", async () => {
      const mutations = new MutationRegistry();
      const benchmarks = new BenchmarkRegistry();
      plugin.register({ evolution: { mutations, benchmarks } } as never);
      const mutation = mutations.get("comment-strip")!;

      await expect(mutation.apply({ workspaceRoot }, { filePath: TARGET_FILE })).rejects.toThrow(/does not exist in workspace/);
    });
  });

  describe("documentation-summary benchmark", () => {
    it("scores a response covering the expected concepts higher than an unrelated one", async () => {
      const benchmarks = new BenchmarkRegistry();
      plugin.register({ evolution: { mutations: new MutationRegistry(), benchmarks } } as never);
      const benchmark = benchmarks.get("documentation-summary")!;

      const strong = await benchmark.score(
        "It runs independent tasks in parallel, retries tasks that fail, and skips any task whose dependency failed."
      );
      const weak = await benchmark.score("It does things.");

      expect(strong).toBeGreaterThan(weak);
    });
  });
});
