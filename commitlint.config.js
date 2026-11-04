// Conventional Commits with a mandatory issue reference, the same rules as the
// commitlint gate of the pipeline (QG-9.14, FR-4.9).
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "references-empty": [2, "never"],
  },
};
