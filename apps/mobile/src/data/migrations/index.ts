import type { LocalDatabase } from "../local-database";
import { initial } from "./001-initial";

export interface Migration {
  /** Positive and unique; migrations run in increasing order. */
  readonly version: number;
  run(db: LocalDatabase): Promise<void>;
}

/** Where the runner keeps the number of the last migration that ran. */
export interface SchemaVersion {
  get(): Promise<number>;
  set(version: number): Promise<void>;
}

export const migrations: readonly Migration[] = [initial];

/**
 * Runs the migrations newer than the stored version, in order, and stores
 * the version after each one. Returns the version the schema is at.
 */
export async function runMigrations(
  db: LocalDatabase,
  schema: SchemaVersion,
  list: readonly Migration[] = migrations,
): Promise<number> {
  let current = await schema.get();
  const pending = list
    .filter((m) => m.version > current)
    .sort((a, b) => a.version - b.version);
  for (const migration of pending) {
    await migration.run(db);
    await schema.set(migration.version);
    current = migration.version;
  }
  return current;
}
