import type { Migration } from ".";

/** Schema version 1: no collections to prepare yet. */
export const initial: Migration = () => Promise.resolve();
