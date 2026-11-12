import type { ContentChange } from "@parapka/protocol";
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

const input = { title: "Zmywanie", rule: WEEKDAYS, assignment: ME };

describe("the note and the reminder", () => {
  it("are fields that are valid only as null or a good value", () => {
    expect(isChoreField("note")).toBe(true);
    expect(isChoreField("reminder")).toBe(true);
    expect(isValidField("note", null)).toBe(true);
    expect(isValidField("note", "Dwa razy")).toBe(true);
    expect(isValidField("note", 5)).toBe(false);
    expect(isValidField("reminder", "08:30")).toBe(true);
    expect(isValidField("reminder", "24:00")).toBe(false);
  });

  it("are stored, edited one by one and read as null when missing", async () => {
    const { chores, database } = createSingleDevice();
    const plain = await chores.add(input);
    expect(plain).toMatchObject({ note: null, reminder: null });
    const added = await chores.add({
      ...input,
      note: "Dwa razy",
      reminder: "08:30",
    });
    expect(added).toMatchObject({ note: "Dwa razy", reminder: "08:30" });
    await chores.edit(added.id, { note: null });
    expect(await chores.list()).toMatchObject([
      { id: plain.id, note: null },
      { id: added.id, note: null, reminder: "08:30" },
    ]);
    const record = (await database.get("chores", plain.id)) as {
      pending: { fields: Record<string, unknown> };
    };
    expect(Object.keys(record.pending.fields)).not.toContain("note");
  });

  it("block a save with a bad note or time", async () => {
    const { chores } = createSingleDevice();
    await expect(chores.add({ ...input, reminder: "24:00" })).rejects.toThrow(
      "reminder",
    );
    const { id } = await chores.add(input);
    await expect(chores.edit(id, { note: "x".repeat(501) })).rejects.toThrow(
      "note",
    );
    expect(await chores.list()).toMatchObject([{ note: null, reminder: null }]);
  });

  it("reach the partner and clear with null (LWW)", async () => {
    const pair = await setupChorePair();
    const { id } = await pair.ca.add({
      ...input,
      note: "A",
      reminder: "07:00",
    });
    await exchange(pair);
    expect(await pair.cb.list()).toMatchObject([
      { note: "A", reminder: "07:00" },
    ]);
    await pair.cb.edit(id, { reminder: null });
    await exchange(pair);
    expect(await pair.ca.list()).toMatchObject([{ note: "A", reminder: null }]);
  });

  it("skip invalid values from the partner", async () => {
    const { chores, handler } = createSingleDevice();
    const upsert = (
      fields: Record<string, unknown>,
      physical: number,
    ): ContentChange => ({
      entity: "Chore",
      id: "p-1",
      op: "upsert",
      fields: Object.fromEntries(
        Object.entries(fields).map(([name, value]) => [
          name,
          { value, hlc: formatHlc(createHlc(physical, 0, "x")) },
        ]),
      ),
    });
    const valid = {
      title: "Pranie",
      rule: { kind: "daily" },
      assignment: { kind: "anyone" },
      note: "Dobra",
      reminder: "09:00",
    };
    await handler.apply(upsert(valid, 10));
    await handler.apply(
      upsert({ note: "x".repeat(501), reminder: "99:99" }, 20),
    );
    expect(await chores.list()).toMatchObject([
      { note: "Dobra", reminder: "09:00" },
    ]);
  });
});
