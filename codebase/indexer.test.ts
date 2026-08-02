import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildModules, detectLanguage, extractSymbols, scanRepository, searchIndex } from "./indexer";
import type { CodebaseIndex } from "./types";

describe("detectLanguage", () => {
  it("maps known extensions to a language", () => {
    expect(detectLanguage("foo.ts")).toBe("typescript");
    expect(detectLanguage("foo.py")).toBe("python");
    expect(detectLanguage("foo.go")).toBe("go");
  });

  it("returns null for unknown extensions", () => {
    expect(detectLanguage("foo.xyz")).toBeNull();
  });
});

describe("extractSymbols", () => {
  it("extracts exported functions, classes, consts, interfaces and types from TypeScript", () => {
    const content = `
export function doThing() {}
export class Widget {}
export const CONFIG = {};
export interface Options {}
export type Mode = "a" | "b";
`;
    const symbols = extractSymbols(content, "typescript");
    expect(symbols.map((s) => s.name).sort()).toEqual(["CONFIG", "Mode", "Options", "Widget", "doThing"].sort());
    expect(symbols.find((s) => s.name === "doThing")?.kind).toBe("function");
  });

  it("extracts Python def/class", () => {
    const symbols = extractSymbols("def handler():\n    pass\n\nclass Handler:\n    pass\n", "python");
    expect(symbols).toEqual([
      { name: "handler", kind: "function", line: 1 },
      { name: "Handler", kind: "class", line: 4 }
    ]);
  });

  it("returns an empty array for a language with no pattern table", () => {
    expect(extractSymbols("# hello", "markdown")).toEqual([]);
  });

  it("returns an empty array for null language", () => {
    expect(extractSymbols("anything", null)).toEqual([]);
  });
});

describe("scanRepository", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ashos-codebase-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("scans real files on disk and extracts symbols", () => {
    fs.mkdirSync(path.join(root, "kernel"), { recursive: true });
    fs.writeFileSync(path.join(root, "kernel", "event-bus.ts"), "export class EventBus {}\n");
    fs.writeFileSync(path.join(root, "README.md"), "# hi\n");

    const files = scanRepository(root);
    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual(["README.md", path.join("kernel", "event-bus.ts")].sort());

    const eventBusFile = files.find((f) => f.path.endsWith("event-bus.ts"))!;
    expect(eventBusFile.language).toBe("typescript");
    expect(eventBusFile.symbols).toEqual([{ name: "EventBus", kind: "class", line: 1 }]);
  });

  it("skips ignored directories entirely", () => {
    fs.mkdirSync(path.join(root, "node_modules", "pkg"), { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules", "pkg", "index.js"), "export const x = 1;\n");
    fs.mkdirSync(path.join(root, ".git"), { recursive: true });
    fs.writeFileSync(path.join(root, ".git", "config"), "junk");
    fs.writeFileSync(path.join(root, "index.ts"), "export const real = 1;\n");

    const files = scanRepository(root);
    expect(files.map((f) => f.path)).toEqual(["index.ts"]);
  });

  it("skips dotfiles and dotdirs", () => {
    fs.writeFileSync(path.join(root, ".env"), "SECRET=1");
    fs.mkdirSync(path.join(root, ".vscode"), { recursive: true });
    fs.writeFileSync(path.join(root, ".vscode", "settings.json"), "{}");
    fs.writeFileSync(path.join(root, "visible.ts"), "export const ok = 1;\n");

    const files = scanRepository(root);
    expect(files.map((f) => f.path)).toEqual(["visible.ts"]);
  });

  it("skips files larger than the configured max size", () => {
    fs.writeFileSync(path.join(root, "small.ts"), "export const a = 1;\n");
    fs.writeFileSync(path.join(root, "big.ts"), "x".repeat(200));

    const files = scanRepository(root, { maxFileBytes: 100 });
    expect(files.map((f) => f.path)).toEqual(["small.ts"]);
  });
});

describe("buildModules", () => {
  it("rolls files up by top-level directory, root files under (root)", () => {
    const modules = buildModules([
      { path: "kernel/event-bus.ts", language: "typescript", bytes: 10, symbols: [{ name: "EventBus", kind: "class", line: 1 }] },
      { path: "kernel/logger.ts", language: "typescript", bytes: 10, symbols: [] },
      { path: "README.md", language: "markdown", bytes: 5, symbols: [] }
    ]);

    const kernel = modules.find((m) => m.name === "kernel")!;
    expect(kernel.fileCount).toBe(2);
    expect(kernel.symbolCount).toBe(1);
    expect(kernel.languages).toEqual({ typescript: 2 });

    const root = modules.find((m) => m.name === "(root)")!;
    expect(root.fileCount).toBe(1);
  });

  it("sorts modules by file count descending", () => {
    const modules = buildModules([
      { path: "a/one.ts", language: "typescript", bytes: 1, symbols: [] },
      { path: "b/one.ts", language: "typescript", bytes: 1, symbols: [] },
      { path: "b/two.ts", language: "typescript", bytes: 1, symbols: [] }
    ]);
    expect(modules[0].name).toBe("b");
  });
});

describe("searchIndex", () => {
  const index: CodebaseIndex = {
    root: "/repo",
    commitHash: "abc123",
    fileCount: 2,
    indexedAt: "2026-08-02T00:00:00Z",
    modules: [],
    files: [
      { path: "auth/login.ts", language: "typescript", bytes: 1, symbols: [{ name: "loginUser", kind: "function", line: 3 }] },
      { path: "billing/invoice.ts", language: "typescript", bytes: 1, symbols: [{ name: "createInvoice", kind: "function", line: 1 }] }
    ]
  };

  it("ranks symbol-name matches ahead of path-only matches", () => {
    const matches = searchIndex(index, "login");
    expect(matches[0]).toMatchObject({ file: "auth/login.ts", reason: "symbol" });
  });

  it("is case-insensitive", () => {
    expect(searchIndex(index, "LOGIN").length).toBeGreaterThan(0);
  });

  it("returns an empty array for an empty query", () => {
    expect(searchIndex(index, "")).toEqual([]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(searchIndex(index, "nonexistent")).toEqual([]);
  });
});
