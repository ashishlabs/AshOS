import type { Benchmark } from "../types";

const SIGNALS: RegExp[] = [
  /\bfunction\s+isPalindrome\b|\bconst\s+isPalindrome\s*=/,
  /:\s*boolean/,
  /toLowerCase|toUpperCase/i,
  /replace\(/,
  /reverse\(\)|===|split\(/
];

/**
 * Code-generation benchmark: ask for a small, unambiguous TypeScript
 * function and heuristically score how many expected implementation
 * signals show up in the response. Cheap and fast — no compiler/sandbox
 * required — intentionally a quality *signal*, not a correctness proof.
 */
export const codeGenerationBenchmark: Benchmark = {
  id: "code-gen-is-palindrome",
  category: "code-generation",
  description: "Write a TypeScript isPalindrome(s: string): boolean function",
  input:
    "Write a TypeScript function named isPalindrome that takes a string and returns true if it reads the same forwards and backwards (ignoring case and non-alphanumeric characters), false otherwise. Reply with code only, no prose.",
  timeoutMs: 30_000,
  metadata: { language: "typescript", difficulty: "easy" },
  score(actualOutput: string): number {
    const matches = SIGNALS.filter((pattern) => pattern.test(actualOutput)).length;
    return matches / SIGNALS.length;
  }
};
