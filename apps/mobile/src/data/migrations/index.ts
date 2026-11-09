import type { LocalDatabase } from "../local-database";
import { initial } from "./001-initial";

export type Migration = (db: LocalDatabase) => Promise<void>;

/** Where the number of the last applied migration is kept. */
export interface SchemaVersion {
  get(): Promise<number>;
  set(version: number): Promise<void>;
}

/** Migration number n is at index n - 1; append only. */
export const migrations: readonly Migration[] = [initial];

/** Runs the migrations newer than the stored version, in order. */
export async function runMigrations(
  db: LocalDatabase,
  version: SchemaVersion,
  list: readonly Migration[] = migrations,
): Promise<void> {
  const current = await version.get();
  for (let n = current + 1; n <= list.length; n++) {
    await list[n - 1]?.(db);
    await version.set(n);
  }
}
