import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { linkNodeModules, parseTestSummary, SubprocessWorkspaceExecutor } from "./subprocess-workspace-executor";

const REPO_ROOT = path.resolve(__dirname, "../..");

/**
 * A minimal, self-contained fake "workspace" — not a copy of the real
 * AshOS repo — so these tests exercise real subprocess spawning without
 * depending on the full real build/test suite (slow, and this file *is*
 * part of that suite, which would be circular).
 */
function writeFakeWorkspace(dir: string): void {
  fs.mkdirSync(path.join(dir, "cli"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "fake-ashos-workspace",
      private: true,
      scripts: {
        typecheck: 'node -e "process.exit(0)"',
        test: 'node -e "console.log(\'Tests 4 passed (4)\'); process.exit(0)"'
      }
    })
  );
  fs.writeFileSync(
    path.join(dir, "cli", "index.ts"),
    [
      "const args = process.argv.slice(2);",
      'const i = args.indexOf("--input");',
      'const input = i >= 0 ? args[i + 1] : "";',
      "console.log(JSON.stringify({ content: `handled: ${input}` }));"
    ].join("\n")
  );
}

describe("SubprocessWorkspaceExecutor (real subprocesses, no fakes)", () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-subprocess-exec-"));
    writeFakeWorkspace(workspaceRoot);
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("links node_modules from the source repo instead of reinstalling", () => {
    linkNodeModules(REPO_ROOT, workspaceRoot);
    const linked = path.join(workspaceRoot, "node_modules");
    expect(fs.existsSync(linked)).toBe(true);
    expect(fs.lstatSync(linked).isSymbolicLink()).toBe(true);
  });

  it("is a no-op when node_modules already exists in the workspace", () => {
    fs.mkdirSync(path.join(workspaceRoot, "node_modules"));
    fs.writeFileSync(path.join(workspaceRoot, "node_modules", "marker.txt"), "keep me");
    linkNodeModules(REPO_ROOT, workspaceRoot);
    expect(fs.existsSync(path.join(workspaceRoot, "node_modules", "marker.txt"))).toBe(true);
  });

  it("build() reports success when the workspace's typecheck script exits 0", async () => {
    const executor = new SubprocessWorkspaceExecutor(REPO_ROOT);
    const result = await executor.build(workspaceRoot, 20_000);
    expect(result.success).toBe(true);
  });

  it("build() reports failure when the workspace's typecheck script exits non-zero", async () => {
    fs.writeFileSync(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "x", scripts: { typecheck: 'node -e "process.exit(1)"', test: 'node -e "process.exit(0)"' } })
    );
    const executor = new SubprocessWorkspaceExecutor(REPO_ROOT);
    const result = await executor.build(workspaceRoot, 20_000);
    expect(result.success).toBe(false);
  });

  it("test() parses a clean passed count out of real stdout", async () => {
    const executor = new SubprocessWorkspaceExecutor(REPO_ROOT);
    const result = await executor.test(workspaceRoot, 20_000);
    expect(result.passed).toBe(4);
    expect(result.failed).toBe(0);
  });

  it("test() parses a mixed pass/fail summary", async () => {
    fs.writeFileSync(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({
        name: "x",
        scripts: {
          typecheck: 'node -e "process.exit(0)"',
          test: "node -e \"console.log('Tests 2 failed | 6 passed (8)'); process.exit(1)\""
        }
      })
    );
    const executor = new SubprocessWorkspaceExecutor(REPO_ROOT);
    const result = await executor.test(workspaceRoot, 20_000);
    expect(result.passed).toBe(6);
    expect(result.failed).toBe(2);
  });

  it("parseTestSummary reads the final 'Tests' line, not the 'Test Files' line or a per-file breakdown", () => {
    // Shape of real vitest output when one file has failures: a per-file
    // line reporting that file's own failed count, then a `Test Files`
    // summary, then the actual `Tests` summary last. All three contain a
    // "\d+ failed"/"\d+ passed" substring — only the last one is correct.
    const realisticLog = [
      " ✓ kernel/dag.test.ts (5 tests) 12ms",
      " ❯ evolution/mutation/mutations.test.ts (7 tests | 2 failed) 9ms",
      "",
      " Test Files  1 failed | 28 passed (29)",
      "      Tests  2 failed | 164 passed (166)"
    ].join("\n");

    expect(parseTestSummary(realisticLog)).toEqual({ passed: 164, failed: 2 });
  });

  it("test() parses a realistic multi-file vitest log correctly (regression: previously picked up the wrong line)", async () => {
    fs.writeFileSync(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({
        name: "x",
        scripts: {
          typecheck: 'node -e "process.exit(0)"',
          test:
            'node -e "console.log(\' \\u2717 some.test.ts (7 tests | 2 failed) 9ms\'); console.log(\' Test Files  1 failed | 28 passed (29)\'); console.log(\'      Tests  2 failed | 164 passed (166)\'); process.exit(1)"'
        }
      })
    );
    const executor = new SubprocessWorkspaceExecutor(REPO_ROOT);
    const result = await executor.test(workspaceRoot, 20_000);
    expect(result.passed).toBe(164);
    expect(result.failed).toBe(2);
  });

  it(
    "execute() spawns the workspace's own CLI via tsx and parses its JSON stdout contract",
    async () => {
      const executor = new SubprocessWorkspaceExecutor(REPO_ROOT);
      const output = await executor.execute(workspaceRoot, "hello from the test", 30_000);
      expect(output).toBe("handled: hello from the test");
    },
    30_000
  );
});
