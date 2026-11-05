import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DatabaseSync } from "node:sqlite";

export const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../migrations", import.meta.url),
);

const MIGRATION_FILE = /^(\d{4})_[a-z0-9_]+\.sql$/;

/**
 * Applies the numbered `NNNN_name.sql` files of `dir` that the database has
 * not seen yet, each in a transaction. Running it again changes nothing.
 */
export function migrate(db: DatabaseSync, dir: string = MIGRATIONS_DIR): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)",
  );
  const applied = new Set(
    db
      .prepare("SELECT version FROM schema_migrations")
      .all()
      .map((row) => Number(row["version"])),
  );
  const files = readdirSync(dir)
    .filter((name) => MIGRATION_FILE.test(name))
    .sort();
  for (const name of files) {
    const version = Number(MIGRATION_FILE.exec(name)?.[1]);
    if (applied.has(version)) continue;
    db.exec("BEGIN");
    try {
      db.exec(readFileSync(join(dir, name), "utf8"));
      db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(
        version,
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
