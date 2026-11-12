import { describe, expect, it, vi } from "vitest";

import { createPairedDevices } from "../sync/sync-test-support";
import { ChoreDeviceError } from "./chore-codec";
import {
  createSingleDevice,
  ME,
  PARTNER,
  WEEKDAYS,
  withChores,
} from "./chore-test-support";

const input = { title: "Wynieść śmieci", rule: WEEKDAYS, assignment: ME };

describe("chore repository", () => {
  it("adds a private chore without a pair and lists it", async () => {
    const { chores } = createSingleDevice();
    const added = await chores.add(input);
    expect(added).toEqual({
      id: "solo-1",
      ...input,
      note: null,
      reminder: null,
      shared: false,
    });
    expect(await chores.list()).toEqual([added]);
  });

  it("rejects a chore that is not valid", async () => {
    const { chores } = createSingleDevice();
    await expect(chores.add({ ...input, title: " " })).rejects.toThrow("title");
    await expect(
      chores.add({ ...input, rule: { kind: "monthly", dayOfMonth: 40 } }),
    ).rejects.toThrow("between");
    await expect(
      chores.add({
        ...input,
        assignment: { kind: "person", person: "nobody" as "me" },
      }),
    ).rejects.toThrow("person");
    expect(await chores.list()).toEqual([]);
  });

  it("edits some fields and keeps the others", async () => {
    const { chores } = createSingleDevice();
    const { id } = await chores.add(input);
    await chores.edit(id, { title: "Zakupy" });
    const [chore] = await chores.list();
    expect(chore).toMatchObject({ title: "Zakupy", rule: WEEKDAYS });
    await expect(chores.edit(id, { title: "" })).rejects.toThrow("title");
  });

  it("deletes with a tombstone and restores", async () => {
    const { chores } = createSingleDevice();
    const { id } = await chores.add(input);
    await chores.remove(id);
    expect(await chores.list()).toEqual([]);
    await expect(chores.edit(id, { title: "x" })).rejects.toThrow("deleted");
    await chores.restore(id);
    expect(await chores.list()).toHaveLength(1);
    await expect(chores.remove("missing")).rejects.toThrow("unknown");
  });

  it("tells the listeners about every write", async () => {
    const { chores } = createSingleDevice();
    const listener = vi.fn();
    const unsubscribe = chores.subscribe(listener);
    const { id } = await chores.add(input);
    await chores.remove(id);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    await chores.restore(id);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("needs the device of the person to assign someone", async () => {
    const { chores } = createSingleDevice();
    await expect(chores.add({ ...input, assignment: PARTNER })).rejects.toThrow(
      ChoreDeviceError,
    );
    const unregistered = createSingleDevice(null);
    await expect(unregistered.chores.add(input)).rejects.toThrow("not known");
    const both = await unregistered.chores.add({
      ...input,
      assignment: { kind: "both" },
    });
    expect(both.assignment).toEqual({ kind: "both" });
  });

  it("keeps the alternating assignment and the shared flag with a pair", async () => {
    const { a } = await createPairedDevices();
    const { chores } = withChores(a);
    const assignment = {
      kind: "alternating",
      firstPerson: "partner",
      startDate: "2026-01-05",
    } as const;
    await chores.add({ ...input, assignment });
    await chores.add({ ...input, assignment: { kind: "anyone" } });
    const [first, second] = await chores.list();
    expect(first).toMatchObject({ assignment, shared: true });
    expect(second?.assignment).toEqual({ kind: "anyone" });
  });
});
