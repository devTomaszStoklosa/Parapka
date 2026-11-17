import { createHlc, formatHlc } from "@parapka/sync";
import { describe, expect, it } from "vitest";

import { createCompletionRepository } from "../chores/completion-repository";
import { createChoreRepository } from "../chores/chore-repository";
import { createMemoryDatabase } from "../data/memory-database";
import { createPairRepository } from "../pairing/pair-repository";
import { createMemoryKeyStore } from "../platform/memory-key-store";
import { buildExport } from "./export-data";
import {
  momentOf,
  personalAssignment,
  personOf,
  pick,
  syncedRows,
} from "./export-sections";

const NOW = new Date(2026, 10, 16, 12).getTime();
const clock = { nowMs: () => NOW };
const devices = { own: "dev-own", partner: "dev-partner" };

async function setup() {
  const database = createMemoryDatabase();
  const keyStore = createMemoryKeyStore();
  const pairs = createPairRepository(database, keyStore);
  await pairs.savePending(
    {
      pairMailboxId: "mailbox",
      deviceId: devices.partner,
      signingPublicKey: "sig",
      agreementPublicKey: "agr",
    },
    { sendKey: Uint8Array.from([1]), receiveKey: Uint8Array.from([2]) },
  );
  await pairs.confirm();
  let n = 0;
  const chores = createChoreRepository({
    database,
    pairs,
    identity: { deviceId: () => Promise.resolve(devices.own) },
    newId: () => `chore-${String((n += 1))}`,
  });
  return { database, chores };
}

const daily = { kind: "daily" } as const;

describe("export sections", () => {
  it("tells the people from the device ids", () => {
    expect(personOf("dev-own", devices)).toBe("me");
    expect(personOf("dev-partner", devices)).toBe("partner");
    expect(personOf("other", devices)).toBe("partner");
    const unregistered = { own: null, partner: "dev-partner" };
    expect(personOf("dev-partner", unregistered)).toBe("partner");
    expect(personOf("other", unregistered)).toBe("me");
  });

  it("turns an HLC into a moment without the device", () => {
    const text = formatHlc(createHlc(NOW, 3, "secretdevice"));
    expect(momentOf(text)).toBe(new Date(NOW).toISOString());
  });

  it("gives no moment for a value that is no HLC", () => {
    expect(momentOf(undefined)).toBeNull();
  });

  it("picks the named fields that exist", () => {
    expect(pick({ a: 1, b: 2, c: undefined }, ["a", "c", "d"])).toEqual({
      a: 1,
    });
  });

  it("translates every kind of assignment", () => {
    const assign = (value: unknown) => personalAssignment(value, devices);
    expect(assign({ kind: "person", deviceId: "dev-partner" })).toEqual({
      kind: "person",
      person: "partner",
    });
    expect(
      assign({ kind: "alternating", firstDeviceId: "dev-own", startDate: "d" }),
    ).toEqual({ kind: "alternating", firstPerson: "me", startDate: "d" });
    expect(assign({ kind: "both" })).toEqual({ kind: "both" });
    expect(assign(undefined)).toBeNull();
  });

  it("reads the merged state with the pending edits and drops deleted records", async () => {
    const { database, chores } = await setup();
    const kept = await chores.add({
      title: "KEPT",
      rule: daily,
      assignment: { kind: "person", person: "partner" },
    });
    await chores.edit(kept.id, { title: "EDITED" });
    const removed = await chores.add(
      { title: "GONE", rule: daily, assignment: { kind: "anyone" } },
      { private: true },
    );
    await chores.remove(removed.id);
    await chores.sync.merge({
      entity: "Chore",
      id: "chore-merged",
      op: "upsert",
      fields: {
        title: { value: "MERGED", hlc: formatHlc(createHlc(NOW, 0, "d")) },
      },
    });
    const rows = await syncedRows(database, "chores");
    expect(rows.map(({ values }) => values.title)).toEqual([
      "EDITED",
      "MERGED",
    ]);
    expect(rows[0]).toMatchObject({
      id: kept.id,
      shared: true,
      values: { title: "EDITED" },
    });
  });

  it("exports the private chores and the ones of the partner", async () => {
    const { database, chores } = await setup();
    await chores.add(
      {
        title: "PRIVATE",
        rule: daily,
        assignment: {
          kind: "alternating",
          firstPerson: "partner",
          startDate: "2026-11-01",
        },
      },
      { private: true },
    );
    const document = await buildExport({ database, clock });
    expect(document.chores).toEqual([
      expect.objectContaining({
        title: "PRIVATE",
        assignment: {
          kind: "alternating",
          firstPerson: "partner",
          startDate: "2026-11-01",
        },
      }),
    ]);
  });

  it("is empty on an empty database", async () => {
    const document = await buildExport({
      database: createMemoryDatabase(),
      clock,
    });
    expect(document).toMatchObject({ profile: null, chores: [] });
    expect(document.checkinSchedule).toBeNull();
  });

  it("skips a partial check-off of the partner instead of failing", async () => {
    const database = createMemoryDatabase();
    const completions = createCompletionRepository({
      database,
      chores: {} as never,
      identity: { deviceId: () => Promise.resolve("dev-own") },
      clock: { nowMs: () => NOW },
    });
    await completions.sync.merge({
      entity: "ChoreCompletion",
      id: "partial",
      op: "upsert",
      fields: {
        choreId: { value: "chore-1", hlc: formatHlc(createHlc(NOW, 0, "d")) },
      },
    });
    const document = await buildExport({
      database,
      clock: { nowMs: () => NOW },
    });
    expect(document.choreCompletions).toEqual([]);
  });
});
