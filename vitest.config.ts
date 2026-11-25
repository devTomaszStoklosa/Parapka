import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  define: { __DEV__: "false" },
  resolve: {
    alias: {
      "react-native": "react-native-web",
      // Expo web resolves react-native-svg to its web build; so do the tests.
      "react-native-svg": "react-native-svg/lib/module/ReactNativeSVG.web.js",
      "@react-native/assets-registry/registry": fileURLToPath(
        new URL("apps/mobile/test-stubs/assets-registry.ts", import.meta.url),
      ),
    },
    extensions: [
      ".web.tsx",
      ".web.ts",
      ".tsx",
      ".ts",
      ".web.js",
      ".js",
      ".json",
    ],
  },
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "services/*/src/**/*.test.ts",
      "apps/*/src/**/*.test.{ts,tsx}",
    ],
    // The coverage gate of the pipeline compares coverage/coverage-summary.json
    // with the report of the base commit (QG-7.6).
    coverage: {
      provider: "v8",
      include: [
        "packages/*/src/**/*.ts",
        "services/*/src/**/*.ts",
        "apps/*/src/**/*.{ts,tsx}",
      ],
      exclude: ["**/*.test.{ts,tsx}", "services/*/src/server.ts"],
      reporter: ["text", "json-summary"],
    },
  },
});
