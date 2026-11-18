import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  createPairWorld,
  deleteAllOf,
  type Device,
  type PairWorld,
} from "./pair-test-support.js";
import { SqliteStore } from "./store/sqlite-store.js";

const PUSH_TOKEN = "push-token-only-of-device-a";

let directory: string;
let file: string;
let store: SqliteStore;
let world: PairWorld;

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "parapka-delete-all-"));
  file = join(directory, "relay.sqlite");
  store = new SqliteStore(file);
  world = await createPairWorld({ store });
});

afterEach(async () => {
  await world.app.close();
  store.close();
  rmSync(directory, { recursive: true, force: true });
});

// The tables of the relay file that hold a row with one of the texts; the
// file is opened on its own, so the answer comes from the stored data.
function tablesHolding(needles: readonly string[]): string[] {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations' ORDER BY name",
      )
      .all()
      .map((row) => String(row["name"]));
    return tables.filter((table) =>
      db
        .prepare(`SELECT * FROM "${table}"`)
        .all()
        .some((row) => needles.some((n) => JSON.stringify(row).includes(n))),
    );
  } finally {
    db.close();
  }
}

// The things that identify device A on the relay.
async function traceOf(a: Device): Promise<string[]> {
  const stored = await store.getDevice(a.deviceId);
  return [a.deviceId, stored?.signingPublicKey ?? "missing", PUSH_TOKEN];
}

async function pairedDevices() {
  const a = await world.newDevice("a");
  const b = await world.newDevice("b");
  const { pairMailboxId } = await world.pair(a, b);
  await world.exchangeProfiles(a, b);
  await a.client.setPushToken({ platform: "fcm", pushToken: PUSH_TOKEN });
  return { a, b, pairMailboxId };
}

it("deletes everything of A: 404 for the device, the partner learns, no trace left", async () => {
  const { a, b, pairMailboxId } = await pairedDevices();
  const trace = await traceOf(a);
  expect(tablesHolding(trace)).toEqual(["devices", "invitations", "mailboxes"]);

  expect(await deleteAllOf(a)).toBe("done");

  const challenge = await world.app.inject({
    method: "POST",
    url: `/v1/devices/${a.deviceId}/challenges`,
  });
  expect(challenge.statusCode).toBe(404);

  // The mailbox is closed, not deleted, and still waits for B.
  expect(await world.resend(b, pairMailboxId)).toMatchObject({ status: 410 });
  const waiting = await b.client.fetchEnvelopes(pairMailboxId, null);
  expect(waiting.envelopes.map((e) => e.envelope.senderDeviceId)).toContain(
    a.deviceId,
  );
  expect(tablesHolding(trace)).toEqual(["envelopes", "mailboxes"]);

  await world.expectEndedByPartner(b);
  // The sync engine of B does not acknowledge the command that ended the pair
  // (it returns first), so the acknowledgement comes from the client.
  await b.client.ack(
    pairMailboxId,
    waiting.envelopes.map((e) => e.envelope.envelopeId),
  );
  expect(tablesHolding(trace)).toEqual([]);
});

it("control: deleting the device before the mailbox is closed drops the open mailbox", async () => {
  const { a, b, pairMailboxId } = await pairedDevices();

  await a.client.deleteDevice();

  await expect(
    b.client.fetchEnvelopes(pairMailboxId, null),
  ).rejects.toMatchObject({ status: 403 });
});
