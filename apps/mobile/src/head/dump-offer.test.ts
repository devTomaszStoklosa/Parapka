import { describe, expect, it } from "vitest";

import { wireChores } from "../chores/wiring";
import { createDumpOffer } from "./dump-offer";
import { setup, useSodium } from "./head-test-screen-support";

const DAY = 24 * 60 * 60 * 1000;

useSodium();

async function offerOf(paired: boolean) {
  const { platform, time } = await setup(paired);
  const offer = createDumpOffer({
    database: platform.database,
    pairs: wireChores(platform).pairs,
    clock: platform.clock,
  });
  return { platform, time, offer };
}

describe("dump offer", () => {
  it("is not due without a pair, and writes nothing", async () => {
    const { platform, offer } = await offerOf(false);
    expect(await offer.due()).toBe(false);
    await offer.dismiss();
    expect(await platform.database.list("dump-offer")).toEqual([]);
  });

  it("is due for 7 days from the first look at the pair", async () => {
    const { time, offer } = await offerOf(true);
    expect(await offer.due()).toBe(true);
    time.now += 7 * DAY - 1;
    expect(await offer.due()).toBe(true);
    time.now += 1;
    expect(await offer.due()).toBe(false);
  });

  it("ends for good when dismissed", async () => {
    const { platform, offer } = await offerOf(true);
    await offer.dismiss();
    expect(await offer.due()).toBe(false);
    expect(await platform.database.get("dump-offer", "state")).toMatchObject({
      pairMailboxId: "mailbox",
      dismissed: true,
    });
  });

  it("starts 7 days again for another pair", async () => {
    const { platform, time, offer } = await offerOf(true);
    await platform.database.put("dump-offer", "state", {
      pairMailboxId: "older",
      firstSeenMs: time.now - 30 * DAY,
      dismissed: true,
    });
    expect(await offer.due()).toBe(true);
    expect(await platform.database.get("dump-offer", "state")).toEqual({
      pairMailboxId: "mailbox",
      firstSeenMs: time.now,
      dismissed: false,
    });
  });
});
