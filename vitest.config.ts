import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "services/*/src/**/*.test.ts"],
    // The coverage gate of the pipeline compares coverage/coverage-summary.json
    // with the report of the base commit (QG-7.6).
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "services/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "services/*/src/server.ts"],
      reporter: ["text", "json-summary"],
    },
  },
});
