import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

// The pipeline passes the complexity threshold of .sdlc-agents.yml to the
// gates and to the hooks of agent sessions alike (QG-7.7, QG-7.12).
const maxComplexity = Number(process.env.SDLC_MAX_FUNCTION_COMPLEXITY ?? 10);

export default defineConfig(
  { ignores: ["coverage/", "dist/"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    // Size and complexity thresholds for SRP and KISS.
    rules: {
      complexity: ["error", maxComplexity],
      "max-depth": ["error", 4],
      "max-params": ["error", 4],
      "max-lines": [
        "error",
        { max: 300, skipBlankLines: true, skipComments: true },
      ],
      "max-lines-per-function": [
        "error",
        { max: 50, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    files: ["**/*.test.ts"],
    rules: { "max-lines-per-function": "off" },
  },
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { process: "readonly" } },
  },
  prettier,
);
