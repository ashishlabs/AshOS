export type SymbolKind = "function" | "class" | "const" | "interface" | "type" | "other";

/** One named, locatable thing inside a file — the atomic unit "where does X live" resolves to. */
export interface CodebaseSymbol {
  name: string;
  kind: SymbolKind;
  line: number;
}

/** One scanned source file, relative to the indexed root. */
export interface CodebaseFile {
  path: string;
  language: string | null;
  bytes: number;
  symbols: CodebaseSymbol[];
}

/** A top-level directory rolled up into a coarse-grained unit — "the auth module," not 40 individual files. */
export interface CodebaseModule {
  name: string;
  fileCount: number;
  languages: Record<string, number>;
  symbolCount: number;
}

/**
 * A cached, structured index of one local repository — Local Codebase
 * Intelligence's persisted unit. Distinct from
 * `innovation/repository/types.ts`'s `RepositoryProfile`, which analyzes
 * *external* GitHub repositories via their API (stars, license, languages
 * breakdown) for Innovation Intelligence; this indexes the actual working
 * tree on disk, file by file, so an agent can answer "where does feature X
 * live" without re-scanning or re-grepping every time.
 */
export interface CodebaseIndex {
  root: string;
  /** git HEAD commit hash at index time, or null when `root` isn't a git repository — the cache-invalidation fingerprint (see repository/repository-profile-store.ts's `pushedAt` for the equivalent external-repo pattern). */
  commitHash: string | null;
  fileCount: number;
  files: CodebaseFile[];
  modules: CodebaseModule[];
  indexedAt: string;
}

export interface CodebaseMatch {
  file: string;
  symbol?: CodebaseSymbol;
  reason: "symbol" | "path";
}
