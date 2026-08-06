import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "kernel/**/*.test.ts",
      "providers/**/*.test.ts",
      "tools/**/*.test.ts",
      "memory/**/*.test.ts",
      "agents/**/*.test.ts",
      "planner/**/*.test.ts",
      "workflow/**/*.test.ts",
      "scheduler/**/*.test.ts",
      "sdk/**/*.test.ts",
      "api/**/*.test.ts",
      "cli/**/*.test.ts",
      "innovation/**/*.test.ts",
      "codebase/**/*.test.ts",
      "graph/**/*.test.ts",
      "inbox/**/*.test.ts",
      "search/**/*.test.ts",
      "vault/**/*.test.ts",
      "workspace/**/*.test.ts",
      "tests/**/*.test.ts"
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "kernel/**/*.ts",
        "providers/**/*.ts",
        "tools/**/*.ts",
        "memory/**/*.ts",
        "agents/**/*.ts",
        "planner/**/*.ts",
        "workflow/**/*.ts",
        "scheduler/**/*.ts",
        "sdk/**/*.ts",
        "api/**/*.ts",
        "cli/**/*.ts",
        "innovation/**/*.ts",
        "codebase/**/*.ts",
        "graph/**/*.ts",
        "inbox/**/*.ts",
        "search/**/*.ts",
        "vault/**/*.ts",
        "workspace/**/*.ts"
      ],
      exclude: ["**/*.test.ts", "**/types.ts"]
    }
  }
});
