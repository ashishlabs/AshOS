import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AskAgent } from "./ask-agent";
import type { Citation } from "./ask-agent";
import { MemoryManager } from "../memory/memory-manager";
import { VaultManager } from "../vault/vault-manager";
import { InboxManager } from "../inbox/inbox-manager";
import { ToolRegistry } from "../tools/registry";
import { MockProvider } from "../providers/mock-provider";
import type { AgentContext } from "./types";

describe("AskAgent", () => {
  let root: string;
  let context: AgentContext;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-ask-agent-"));
    context = { provider: new MockProvider(), tools: new ToolRegistry(), cwd: root };
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("requires a question", async () => {
    const agent = new AskAgent();
    const result = await agent.execute({ id: "t1", description: "" }, context);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no question/);
  });

  it("reports nothing captured when the knowledge base is empty", async () => {
    const agent = new AskAgent();
    const result = await agent.execute({ id: "t1", description: "what is SM-2?" }, context);
    expect(result.ok).toBe(true);
    expect(result.output).toBe("Nothing captured about that yet.");
    expect((result.data as { citations: Citation[] }).citations).toEqual([]);
  });

  it("answers grounded in a real Vault note, citing it", async () => {
    const memory = new MemoryManager(root, { provider: new MockProvider() });
    const vault = new VaultManager(memory);
    await vault.create("SuperMemo-2 Algorithm", "SM-2 schedules flashcard reviews using an ease factor updated after every review.");

    const agent = new AskAgent();
    const result = await agent.execute({ id: "t1", description: "What does SM-2 use to schedule reviews?" }, context);

    expect(result.ok).toBe(true);
    // MockProvider echoes deterministically — confirms the excerpt actually reached the prompt.
    expect(result.output).toContain("ease factor");
    const { citations } = result.data as { citations: Citation[] };
    expect(citations.length).toBeGreaterThan(0);
    expect(citations.some((c) => c.source === "vault" && c.title === "SuperMemo-2 Algorithm")).toBe(true);
  });

  it("answers grounded in a real Inbox item via keyword mode when semantic is disabled", async () => {
    const memory = new MemoryManager(root);
    const inbox = new InboxManager(memory);
    await inbox.capture("AshOS uses node:sqlite for project and global memory scopes", { tags: ["architecture"] });

    const agent = new AskAgent();
    const result = await agent.execute(
      { id: "t1", description: "node:sqlite", input: { semantic: false } },
      context
    );

    expect(result.ok).toBe(true);
    const { citations } = result.data as { citations: Citation[] };
    expect(citations.some((c) => c.source === "inbox")).toBe(true);
  });

  it("prefers task.input.question over task.description when both are given", async () => {
    const memory = new MemoryManager(root, { provider: new MockProvider() });
    const vault = new VaultManager(memory);
    await vault.create("Target Note", "This is the note the question should actually match.");

    const agent = new AskAgent();
    const result = await agent.execute(
      { id: "t1", description: "irrelevant placeholder", input: { question: "Target Note" } },
      context
    );

    expect(result.ok).toBe(true);
    const { question, citations } = result.data as { question: string; citations: Citation[] };
    expect(question).toBe("Target Note");
    expect(citations.some((c) => c.title === "Target Note")).toBe(true);
  });

  it("respects a custom limit", async () => {
    const memory = new MemoryManager(root);
    const vault = new VaultManager(memory);
    for (let i = 0; i < 5; i++) {
      await vault.create(`Note ${i}`, "Shared searchable content about testing limits.");
    }

    const agent = new AskAgent();
    const result = await agent.execute(
      { id: "t1", description: "testing limits", input: { limit: 2, semantic: false } },
      context
    );

    const { citations } = result.data as { citations: Citation[] };
    expect(citations.length).toBeLessThanOrEqual(2);
  });
});
