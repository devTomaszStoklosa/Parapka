import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "./migrate.js";
import { SqliteStore } from "./sqlite-store.js";
import { runStoreContract } from "./store-contract.js";

const opened: SqliteStore[] = [];
afterEach(() => {
  for (const store of opened.splice(0)) store.close();
});

runStoreContract("sqlite", () => {
  const store = new SqliteStore(":memory:");
  opened.push(store);
  return store;
});

function dump(db: DatabaseSync): unknown {
  return {
    schema: db.prepare("SELECT * FROM sqlite_master ORDER BY name").all(),
    migrations: db.prepare("SELECT * FROM schema_migrations").all(),
  };
}

describe("sqlite migrations", () => {
  it("leave the database unchanged when run again", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db);
    const before = dump(db);
    migrate(db);
    expect(dump(db)).toEqual(before);
    expect(db.prepare("SELECT version FROM schema_migrations").all()).toEqual([
      { version: 1 },
      { version: 2 },
    ]);
  });

  it("keeps data across runs on a file database", () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-"));
    try {
      const file = join(dir, "relay.db");
      const first = new SqliteStore(file);
      first.close();
      const db = new DatabaseSync(file);
      db.prepare(
        "INSERT INTO devices (device_id, signing_public_key, created_at_ms) VALUES ('d', 'k', 1)",
      ).run();
      db.close();
      const second = new SqliteStore(file);
      opened.push(second);
      return expect(second.getDevice("d")).resolves.not.toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rolls back a failing migration and leaves it unapplied", () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-migrations-"));
    const db = new DatabaseSync(":memory:");
    try {
      writeFileSync(join(dir, "0001_bad.sql"), "CREATE TABLE broken (");
      expect(() => {
        migrate(db, dir);
      }).toThrow();
      const rows = db.prepare("SELECT version FROM schema_migrations").all();
      expect(rows).toEqual([]);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("has no columns for names, e-mails or phone numbers (NFR-PRV-03)", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db);
    const allowed = new Set([
      "device_id",
      "signing_public_key",
      "push_platform",
      "push_token",
      "created_at_ms",
      "challenge_id",
      "nonce",
      "expires_at_ms",
      "invitation_id",
      "pair_mailbox_id",
      "device_id_a",
      "device_id_b",
      "seq",
      "envelope_id",
      "body",
      "received_at_ms",
      "version",
      "accepted_by_device_id",
      "encrypted_keys_b",
    ]);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => String(row["name"]))
      .filter((name) => !name.startsWith("sqlite_"));
    const columns = tables.flatMap((table) =>
      db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => String(row["name"])),
    );
    expect(columns.filter((column) => !allowed.has(column))).toEqual([]);
  });
});
