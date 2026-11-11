import { describe, expect, it } from "vitest";

import { createPairedDevices } from "../sync/sync-test-support";
import {
  PARTNER,
  WEEKDAYS,
  createSingleDevice,
  withChores,
} from "./chore-test-support";

const input = { title: "Wynieść śmieci", rule: WEEKDAYS, assignment: PARTNER };

describe("release of a chore", () => {
  it("makes anyone responsible for the partner too (FR-CHR-04)", async () => {
    const { a, b } = await createPairedDevices();
    const ca = withChores(a).chores;
    const cb = withChores(b).chores;
    const { id } = await ca.add({
      ...input,
      assignment: { kind: "person", person: "me" },
    });
    await a.engine.sync();
    await b.engine.sync();
    await a.engine.sync();
    await ca.release(id);
    await a.engine.sync();
    await b.engine.sync();
    expect(await cb.list()).toMatchObject([{ assignment: { kind: "anyone" } }]);
  });

  it("adds no entity and no event", async () => {
    const { database, chores } = createSingleDevice();
    const { id } = await chores.add({ ...input, assignment: { kind: "both" } });
    const before = (await database.list("chores")).length;
    const collections = ["events", "notifications"];
    await chores.release(id);
    expect((await database.list("chores")).length).toBe(before);
    for (const name of collections) {
      expect(await database.list(name)).toEqual([]);
    }
    expect(await chores.list()).toMatchObject([
      { assignment: { kind: "anyone" } },
    ]);
  });

  it("fails for an unknown chore", async () => {
    const { chores } = createSingleDevice();
    await expect(chores.release("nope")).rejects.toThrow("unknown chore");
  });
});
