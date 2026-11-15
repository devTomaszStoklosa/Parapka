import { describe, expect, it } from "vitest";

import { seedPrivate, setupSharePair } from "./share-sync-support";

describe("the question about private records", () => {
  it("lists the private chores and things", async () => {
    const pair = await setupSharePair();
    await seedPrivate(pair.ua);
    const found = await pair.ua.service.candidates();
    expect(found?.chores.map((c) => c.title)).toEqual(["Podlać kwiaty"]);
    expect(found?.items.map((i) => i.title)).toEqual(["Umówić wizytę"]);
  });

  it("leaves out the records that are shared already", async () => {
    const pair = await setupSharePair();
    await pair.ua.chores.add({
      title: "Wspólny",
      rule: { kind: "daily" },
      assignment: { kind: "anyone" },
    });
    expect(await pair.ua.service.candidates()).toBeNull();
  });

  it("is not due without a pair, without a consent or without records", async () => {
    expect(await (await setupSharePair()).ua.service.candidates()).toBeNull();
    const single = await setupSharePair({ paired: false });
    await seedPrivate(single.ua);
    expect(await single.ua.service.candidates()).toBeNull();
    const unconsented = await setupSharePair({
      canSync: () => Promise.resolve(false),
    });
    await seedPrivate(unconsented.ua);
    expect(await unconsented.ua.service.candidates()).toBeNull();
  });

  it("offers only the categories the person shares", async () => {
    const pair = await setupSharePair({
      shared: (category) => category === "SHARED_CHORES",
    });
    await seedPrivate(pair.ua);
    const found = await pair.ua.service.candidates();
    expect(found?.items).toEqual([]);
    expect(found?.chores).toHaveLength(1);
    const none = await setupSharePair({ shared: () => false });
    await seedPrivate(none.ua);
    expect(await none.ua.service.candidates()).toBeNull();
  });

  it("does not come back after sharing or skipping", async () => {
    const shared = await setupSharePair();
    const first = await seedPrivate(shared.ua);
    await shared.ua.service.share([first.choreId], []);
    expect(await shared.ua.service.candidates()).toBeNull();
    const skipped = await setupSharePair();
    await seedPrivate(skipped.ua);
    await skipped.ua.service.skip();
    expect(await skipped.ua.service.candidates()).toBeNull();
  });

  it("ignores ids that are not private candidates", async () => {
    const pair = await setupSharePair();
    const { choreId } = await seedPrivate(pair.ua);
    await pair.ua.service.share(["unknown", choreId], ["unknown"]);
    const chores = await pair.ua.chores.list();
    expect(chores).toMatchObject([{ shared: true }]);
    expect((await pair.ua.items.list())[0]?.shared).toBe(false);
  });

  it("is settled at the first check, even when nothing is private", async () => {
    const pair = await setupSharePair();
    expect(await pair.ua.service.candidates()).toBeNull();
    await seedPrivate(pair.ua);
    expect(await pair.ua.service.candidates()).toBeNull();
  });

  it("asks again after a new pairing, not for the same pair", async () => {
    let mailbox = "first";
    const pair = await setupSharePair({ mailbox: () => mailbox });
    await seedPrivate(pair.ua);
    await pair.ua.service.skip();
    expect(await pair.ua.service.candidates()).toBeNull();
    mailbox = "second";
    expect(await pair.ua.service.candidates()).not.toBeNull();
  });
});
