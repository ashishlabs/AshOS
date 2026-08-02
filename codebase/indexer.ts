import fs from "node:fs";
import path from "node:path";
import type { CodebaseFile, CodebaseIndex, CodebaseMatch, CodebaseModule, CodebaseSymbol, SymbolKind } from "./types";

const DEFAULT_IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".ashos",
  "coverage",
  ".next",
  ".cache",
  ".turbo",
  "out",
  "vendor",
  "__pycache__"
]);

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".rb": "ruby",
  ".md": "markdown",
  ".json": "json"
};

const MAX_FILE_BYTES = 1_000_000;
const MAX_FILES = 20_000;

export function detectLanguage(filePath: string): string | null {
  return LANGUAGE_BY_EXTENSION[path.extname(filePath)] ?? null;
}

const SYMBOL_PATTERNS: Partial<Record<string, { regex: RegExp; kind: SymbolKind }[]>> = {
  typescript: [
    { regex: /^export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/, kind: "function" },
    { regex: /^export\s+(?:default\s+)?class\s+(\w+)/, kind: "class" },
    { regex: /^export\s+const\s+(\w+)/, kind: "const" },
    { regex: /^export\s+interface\s+(\w+)/, kind: "interface" },
    { regex: /^export\s+type\s+(\w+)/, kind: "type" }
  ],
  javascript: [
    { regex: /^export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/, kind: "function" },
    { regex: /^export\s+(?:default\s+)?class\s+(\w+)/, kind: "class" },
    { regex: /^export\s+const\s+(\w+)/, kind: "const" }
  ],
  python: [
    { regex: /^def\s+(\w+)/, kind: "function" },
    { regex: /^class\s+(\w+)/, kind: "class" }
  ],
  go: [
    { regex: /^func\s+(?:\([^)]*\)\s*)?(\w+)/, kind: "function" },
    { regex: /^type\s+(\w+)/, kind: "class" }
  ]
};

/** Line-by-line regex extraction — deliberately not a full parser (no per-language dependency), same "good enough heuristic" tradeoff as `innovation/repository`'s scoring functions. */
export function extractSymbols(content: string, language: string | null): CodebaseSymbol[] {
  const patterns = language ? SYMBOL_PATTERNS[language] : undefined;
  if (!patterns) return [];

  const symbols: CodebaseSymbol[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    for (const { regex, kind } of patterns) {
      const match = trimmed.match(regex);
      if (match) {
        symbols.push({ name: match[1], kind, line: i + 1 });
        break;
      }
    }
  }
  return symbols;
}

export interface ScanOptions {
  ignoreDirs?: Set<string>;
  maxFileBytes?: number;
  maxFiles?: number;
}

/** Recursively walks `root`, skipping common build/dependency directories, and extracts a lightweight symbol table per source file. */
export function scanRepository(root: string, options: ScanOptions = {}): CodebaseFile[] {
  const ignoreDirs = options.ignoreDirs ?? DEFAULT_IGNORE_DIRS;
  const maxFileBytes = options.maxFileBytes ?? MAX_FILE_BYTES;
  const maxFiles = options.maxFiles ?? MAX_FILES;
  const files: CodebaseFile[] = [];

  function walk(dir: string): void {
    if (files.length >= maxFiles) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      if (entry.name.startsWith(".")) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        let stat: fs.Stats;
        try {
          stat = fs.statSync(fullPath);
        } catch {
          continue;
        }
        if (stat.size > maxFileBytes) continue;

        const relPath = path.relative(root, fullPath);
        const language = detectLanguage(fullPath);
        let symbols: CodebaseSymbol[] = [];
        if (language && language !== "json" && language !== "markdown") {
          try {
            symbols = extractSymbols(fs.readFileSync(fullPath, "utf-8"), language);
          } catch {
            symbols = [];
          }
        }
        files.push({ path: relPath, language, bytes: stat.size, symbols });
      }
    }
  }

  walk(root);
  return files;
}

/** Rolls files up into one module per top-level directory (or "(root)" for files directly under the indexed root). */
export function buildModules(files: CodebaseFile[]): CodebaseModule[] {
  const byModule = new Map<string, CodebaseModule>();

  for (const file of files) {
    const segments = file.path.split(path.sep);
    const name = segments.length > 1 ? segments[0] : "(root)";
    const module_ = byModule.get(name) ?? { name, fileCount: 0, languages: {}, symbolCount: 0 };
    module_.fileCount++;
    module_.symbolCount += file.symbols.length;
    if (file.language) module_.languages[file.language] = (module_.languages[file.language] ?? 0) + 1;
    byModule.set(name, module_);
  }

  return [...byModule.values()].sort((a, b) => b.fileCount - a.fileCount);
}

/** Case-insensitive substring search over symbol names (ranked first) and file paths — deterministic, no embeddings required for "where does X live." */
export function searchIndex(index: CodebaseIndex, query: string): CodebaseMatch[] {
  const needle = query.toLowerCase();
  if (!needle) return [];

  const symbolMatches: CodebaseMatch[] = [];
  const pathMatches: CodebaseMatch[] = [];

  for (const file of index.files) {
    for (const symbol of file.symbols) {
      if (symbol.name.toLowerCase().includes(needle)) {
        symbolMatches.push({ file: file.path, symbol, reason: "symbol" });
      }
    }
    if (file.path.toLowerCase().includes(needle)) {
      pathMatches.push({ file: file.path, reason: "path" });
    }
  }

  return [...symbolMatches, ...pathMatches];
}
