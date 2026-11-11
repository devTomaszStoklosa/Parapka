import { describe, expect, it } from "vitest";

import {
  ME,
  PARTNER,
  WEEKDAYS,
  exchange,
  setupChorePair,
} from "./chore-test-support";

const input = { title: "Wynieść śmieci", rule: WEEKDAYS, assignment: ME };

describe("chore sync", () => {
  it("passes on a rule of weekdays to the partner (FR-CHR-01)", async () => {
    const pair = await setupChorePair();
    await pair.ca.add(input);
    await exchange(pair);
    const [chore] = await pair.cb.list();
    expect(chore).toMatchObject({
      id: "device-a-1",
      title: input.title,
      rule: { kind: "weekdays", weekdays: [1, 4] },
      shared: true,
    });
  });

  it("turns mine into the partner's on the other device", async () => {
    const pair = await setupChorePair();
    await pair.ca.add(input);
    await pair.ca.add({ ...input, assignment: PARTNER });
    await pair.ca.add({
      ...input,
      assignment: {
        kind: "alternating",
        firstPerson: "me",
        startDate: "2026-01-05",
      },
    });
    await exchange(pair);
    const seenByB = await pair.cb.list();
    expect(seenByB.map((chore) => chore.assignment)).toEqual([
      { kind: "person", person: "partner" },
      { kind: "person", person: "me" },
      {
        kind: "alternating",
        firstPerson: "partner",
        startDate: "2026-01-05",
      },
    ]);
    const seenByA = await pair.ca.list();
    expect(seenByA[0]?.assignment).toEqual(ME);
  });

  it("keeps both fields changed offline on the two devices (FR-CHR-06)", async () => {
    const pair = await setupChorePair();
    const { id } = await pair.ca.add({
      ...input,
      rule: { kind: "occasional", dueDate: "2026-02-01" },
    });
    await exchange(pair);
    await pair.ca.edit(id, { title: "Nowy tytuł" });
    await pair.cb.edit(id, {
      rule: { kind: "occasional", dueDate: "2026-02-10" },
    });
    await exchange(pair);
    await exchange(pair);
    for (const chores of [pair.ca, pair.cb]) {
      expect(await chores.list()).toMatchObject([
        {
          title: "Nowy tytuł",
          rule: { kind: "occasional", dueDate: "2026-02-10" },
        },
      ]);
    }
  });

  it("lets the last change of one field win", async () => {
    const pair = await setupChorePair();
    const { id } = await pair.ca.add(input);
    await exchange(pair);
    await pair.ca.edit(id, { title: "Wcześniej" });
    await pair.a.engine.sync();
    await pair.b.engine.sync();
    await pair.cb.edit(id, { title: "Później" });
    await exchange(pair);
    expect((await pair.ca.list())[0]?.title).toBe("Później");
    expect((await pair.cb.list())[0]?.title).toBe("Później");
  });

  it("lets a deletion win over an edit made at the same time", async () => {
    const pair = await setupChorePair();
    const { id } = await pair.ca.add(input);
    await exchange(pair);
    await pair.ca.remove(id);
    await pair.cb.edit(id, { title: "Edytowany" });
    await exchange(pair);
    await exchange(pair);
    expect(await pair.ca.list()).toEqual([]);
    expect(await pair.cb.list()).toEqual([]);
  });

  it("brings a chore back with a restore that is later", async () => {
    const pair = await setupChorePair();
    const { id } = await pair.ca.add(input);
    await exchange(pair);
    await pair.cb.remove(id);
    await exchange(pair);
    expect(await pair.ca.list()).toEqual([]);
    await pair.ca.restore(id);
    await exchange(pair);
    await exchange(pair);
    expect(await pair.ca.list()).toHaveLength(1);
    expect(await pair.cb.list()).toHaveLength(1);
  });

  it("does not send a chore that stays private", async () => {
    const pair = await setupChorePair();
    const { id } = await pair.ca.add(input);
    await pair.ua.handler.disconnected?.();
    await pair.ca.edit(id, { title: "Tylko moje" });
    await exchange(pair);
    expect(await pair.cb.list()).toEqual([]);
    expect(await pair.ca.list()).toMatchObject([
      { title: "Tylko moje", shared: false },
    ]);
  });

  it("sends nothing while SHARED_CHORES is off, and then everything", async () => {
    let shared = false;
    const pair = await setupChorePair(() => shared);
    await pair.ca.add(input);
    await exchange(pair);
    expect(await pair.cb.list()).toEqual([]);
    shared = true;
    await exchange(pair);
    expect(await pair.cb.list()).toHaveLength(1);
  });

  it("does not take in chores of the partner while SHARED_CHORES is off", async () => {
    let shared = true;
    const pair = await setupChorePair(() => shared);
    await pair.ca.add(input);
    await pair.a.engine.sync();
    shared = false;
    await pair.b.engine.sync();
    expect(await pair.cb.list()).toEqual([]);
  });
});
