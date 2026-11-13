import { sealCheckin } from "@parapka/crypto";
import { expect, it } from "vitest";

import { createMemoryDatabase } from "../data/memory-database";
import { createWebSodium } from "../platform/web-sodium";
import { base64Encode } from "../sync/base64";
import type { KeyRecord } from "./key-codec";
import { createReveal } from "./reveal";
import type { PartnerSealed } from "./sealed-repository";

const WEEK = "2026-W45";
const fields = {
  checkinId: `${WEEK}:partner`,
  authorId: "partner",
  version: 1,
};
const own = { checkinId: `${WEEK}:me`, version: 1, sealKey: "own-key" };

async function setup(plain: string, version = 1) {
  const sodium = await createWebSodium();
  const database = createMemoryDatabase();
  const made = sealCheckin(sodium, fields, new TextEncoder().encode(plain));
  const partner: PartnerSealed = { ...fields, version, ...made.sealed };
  const added: string[] = [];
  const state = {
    closed: false,
    own: own as typeof own | null,
    key: {
      checkinId: fields.checkinId,
      version: 1,
      key: base64Encode(made.key),
      own: false,
      sent: true,
    } as KeyRecord | null,
  };
  const reveal = createReveal({
    window: { closed: () => Promise.resolve(state.closed) },
    database,
    sodium,
    sealed: {
      weeks: () => Promise.resolve([WEEK]),
      latestOwn: () => Promise.resolve(state.own),
      partnerVersions: () => Promise.resolve([partner]),
    },
    keys: {
      addOwn: (id, v) => {
        added.push(`${id}|${String(v)}`);
        return Promise.resolve();
      },
      partnerKey: (_id, v) =>
        Promise.resolve(state.key?.version === v ? state.key : null),
    },
  });
  return { reveal, added, state, database };
}

const good = JSON.stringify({ mood: 1, energy: 2, closeness: 3 });

it("opens the version of the partner and keeps the answers", async () => {
  const { reveal, added } = await setup(good);
  await reveal.settle();
  await reveal.settle();
  expect(await reveal.get(WEEK)).toEqual({ mood: 1, energy: 2, closeness: 3 });
  expect(added).toEqual([`${WEEK}:me|1`, `${WEEK}:me|1`]);
  await reveal.forgetReceived();
  expect(await reveal.get(WEEK)).toBeNull();
});

it("queues nothing and opens nothing without the own version", async () => {
  const { reveal, state, added } = await setup(good);
  state.own = null;
  await reveal.settle();
  expect(added).toEqual([]);
  expect(await reveal.get(WEEK)).toBeNull();
});

it("opens nothing without the key or for another version", async () => {
  const { reveal, state } = await setup(good, 2);
  await reveal.settle();
  expect(await reveal.get(WEEK)).toBeNull();
  state.key = null;
  await reveal.settle();
  expect(await reveal.get(WEEK)).toBeNull();
});

it("opens nothing with a wrong key or answers that are not valid", async () => {
  const wrong = await setup(good);
  wrong.state.key = {
    ...(wrong.state.key as KeyRecord),
    key: base64Encode(new Uint8Array(32)),
  };
  await wrong.reveal.settle();
  expect(await wrong.reveal.get(WEEK)).toBeNull();
  const invalid = await setup(JSON.stringify({ mood: 9 }));
  await invalid.reveal.settle();
  expect(await invalid.reveal.get(WEEK)).toBeNull();
});

it("queues no key and opens nothing for a week that is closed", async () => {
  const { reveal, state, added } = await setup(good);
  state.closed = true;
  await reveal.settle();
  expect(added).toEqual([]);
  expect(await reveal.get(WEEK)).toBeNull();
});
