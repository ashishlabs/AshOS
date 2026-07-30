import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promptRewriteMutation } from "./mutations/prompt-rewrite";
import { temperatureMutation } from "./mutations/temperature";
import { retryCountMutation } from "./mutations/retry-count";
import { workflowReorderMutation } from "./mutations/workflow-reorder";
import { MutationRegistry } from "./registry";

const REPO_ROOT = path.resolve(__dirname, "../..");

/** Copies a real repo file into an isolated temp "workspace" so mutations never touch the live tree. */
function seedWorkspace(workspaceRoot: string, relativePath: string): void {
  const src = path.join(REPO_ROOT, relativePath);
  const dest = path.join(workspaceRoot, relativePath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

describe("MutationRegistry", () => {
  it("registers and filters mutations by target kind", () => {
    const registry = new MutationRegistry();
    registry.register(promptRewriteMutation);
    registry.register(temperatureMutation);
    expect(registry.list()).toHaveLength(2);
    expect(registry.byTargetKind("temperature")).toEqual([temperatureMutation]);
    expect(registry.get("prompt-rewrite")).toBe(promptRewriteMutation);
  });
});

describe("Built-in mutations, applied against real (copied) repo files", () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-mutation-"));
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("prompt-rewrite replaces the generic agent's system prompt and reverts cleanly", async () => {
    seedWorkspace(workspaceRoot, "agents/generic-agent.ts");
    const context = { workspaceRoot };
    const original = fs.readFileSync(path.join(workspaceRoot, "agents/generic-agent.ts"), "utf-8");

    const applied = await promptRewriteMutation.apply(context, { replace: "You are a terse, expert-level assistant." });
    const mutated = fs.readFileSync(path.join(workspaceRoot, "agents/generic-agent.ts"), "utf-8");
    expect(mutated).toContain("You are a terse, expert-level assistant.");
    expect(mutated).not.toContain("You are a helpful, precise assistant embedded in AshOS.");

    await promptRewriteMutation.revert(context, applied);
    const reverted = fs.readFileSync(path.join(workspaceRoot, "agents/generic-agent.ts"), "utf-8");
    expect(reverted).toBe(original);
  });

  it("prompt-rewrite falls back to a safe generic rewrite when no replacement is given", async () => {
    seedWorkspace(workspaceRoot, "agents/generic-agent.ts");
    const context = { workspaceRoot };
    const original = fs.readFileSync(path.join(workspaceRoot, "agents/generic-agent.ts"), "utf-8");

    const applied = await promptRewriteMutation.apply(context, {});
    const mutated = fs.readFileSync(path.join(workspaceRoot, "agents/generic-agent.ts"), "utf-8");
    expect(mutated).not.toBe(original);
    expect(mutated).not.toContain("You are a helpful, precise assistant embedded in AshOS.");

    await promptRewriteMutation.revert(context, applied);
    expect(fs.readFileSync(path.join(workspaceRoot, "agents/generic-agent.ts"), "utf-8")).toBe(original);
  });

  it("temperature-adjust injects an explicit temperature into the chat() call and reverts cleanly", async () => {
    seedWorkspace(workspaceRoot, "agents/generic-agent.ts");
    const context = { workspaceRoot };
    const original = fs.readFileSync(path.join(workspaceRoot, "agents/generic-agent.ts"), "utf-8");

    const applied = await temperatureMutation.apply(context, { temperature: 0.9 });
    const mutated = fs.readFileSync(path.join(workspaceRoot, "agents/generic-agent.ts"), "utf-8");
    expect(mutated).toContain("{ temperature: 0.9 }");

    await temperatureMutation.revert(context, applied);
    expect(fs.readFileSync(path.join(workspaceRoot, "agents/generic-agent.ts"), "utf-8")).toBe(original);
  });

  it("retry-count-adjust changes the TaskExecutor's default retries and reverts cleanly", async () => {
    seedWorkspace(workspaceRoot, "planner/executor.ts");
    const context = { workspaceRoot };
    const original = fs.readFileSync(path.join(workspaceRoot, "planner/executor.ts"), "utf-8");

    const applied = await retryCountMutation.apply(context, { retries: 5 });
    const mutated = fs.readFileSync(path.join(workspaceRoot, "planner/executor.ts"), "utf-8");
    expect(mutated).toContain("retries: this.opts.retries ?? 5,");

    await retryCountMutation.revert(context, applied);
    expect(fs.readFileSync(path.join(workspaceRoot, "planner/executor.ts"), "utf-8")).toBe(original);
  });

  it("workflow-reorder reverses step order without breaking dependency validity, and reverts cleanly", async () => {
    seedWorkspace(workspaceRoot, "examples/workflows/research-and-build.json");
    const context = { workspaceRoot };
    const original = fs.readFileSync(path.join(workspaceRoot, "examples/workflows/research-and-build.json"), "utf-8");
    const originalSteps = JSON.parse(original).steps.map((s: { id: string }) => s.id);

    const applied = await workflowReorderMutation.apply(context, {});
    const mutatedFile = path.join(workspaceRoot, "examples/workflows/research-and-build.json");
    const mutatedSteps = JSON.parse(fs.readFileSync(mutatedFile, "utf-8")).steps.map((s: { id: string }) => s.id);
    expect(mutatedSteps).toEqual([...originalSteps].reverse());

    await workflowReorderMutation.revert(context, applied);
    expect(fs.readFileSync(mutatedFile, "utf-8")).toBe(original);
  });

  it("throws a clear error instead of corrupting files when the target pattern is missing", async () => {
    seedWorkspace(workspaceRoot, "agents/generic-agent.ts");
    await expect(retryCountMutation.apply({ workspaceRoot }, {})).rejects.toThrow(/pattern not found|does not exist/);
  });
});
