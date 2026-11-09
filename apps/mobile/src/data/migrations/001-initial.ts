import type { Migration } from "./index";

/** The first schema version; there is nothing to migrate yet. */
export const initial: Migration = {
  version: 1,
  run: () => Promise.resolve(),
};
