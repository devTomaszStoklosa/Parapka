import { createHlc, formatHlc } from "@parapka/sync";
import { describe, expect, it } from "vitest";

import { isChoreField, isValidField } from "./chore-codec";
import {
  ME,
  WEEKDAYS,
  createSingleDevice,
  exchange,
  setupChorePair,
} from "./chore-test-support";

const AT = formatHlc(createHlc(1_800_000_000_000, 0, "device-p"));
const input = { title: "Wynieść śmieci", rule: WEEKDAYS, assignment: ME };

describe("the link of a chore to a thing", () => {
  it("knows the field and checks its values", () => {
    expect(isChoreField("linkedItemId")).toBe(true);
    expect(isValidField("linkedItemId", null)).toBe(true);
    expect(isValidField("linkedItemId", "item-1")).toBe(true);
    expect(isValidField("linkedItemId", "")).toBe(false);
    expect(isValidField("linkedItemId", 5)).toBe(false);
  });

  it("is null for a chore without a link", async () => {
    const { chores } = createSingleDevice();
    expect(await chores.add(input)).toMatchObject({ linkedItemId: null });
  });

  it("is kept on add and on edit", async () => {
    const { chores } = createSingleDevice();
    const added = await chores.add({ ...input, linkedItemId: "item-1" });
    expect(added.linkedItemId).toBe("item-1");
    await chores.edit(added.id, { linkedItemId: null });
    expect(await chores.list()).toMatchObject([{ linkedItemId: null }]);
  });

  it("skips a value of the partner that is not valid", async () => {
    const { chores, handler } = createSingleDevice();
    const upsert = (id: string, value: unknown) =>
      handler.apply({
        entity: "Chore",
        id,
        op: "upsert",
        fields: {
          title: { value: "T", hlc: AT },
          rule: {
            value: { kind: "daily" },
            hlc: AT,
          },
          assignment: {
            value: { kind: "both" },
            hlc: AT,
          },
          linkedItemId: { value, hlc: AT },
        },
      });
    await upsert("p-1", "");
    await upsert("p-2", "item-9");
    const list = await chores.list();
    expect(list.map(({ id, linkedItemId }) => [id, linkedItemId])).toEqual([
      ["p-1", null],
      ["p-2", "item-9"],
    ]);
  });

  it("reaches the partner", async () => {
    const pair = await setupChorePair();
    const { id } = await pair.ca.add({ ...input, linkedItemId: "item-1" });
    await exchange(pair);
    expect(await pair.cb.list()).toMatchObject([{ linkedItemId: "item-1" }]);
    await pair.cb.edit(id, { linkedItemId: null });
    await exchange(pair);
    expect(await pair.ca.list()).toMatchObject([{ linkedItemId: null }]);
  });
});
