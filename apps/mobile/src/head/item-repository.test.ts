import { ChoreValidationError } from "@parapka/domain";
import { describe, expect, it, vi } from "vitest";

import { createSingleDevice } from "./head-test-support";

describe("item repository", () => {
  it("adds an open item with the defaults", async () => {
    const { items } = createSingleDevice();
    const item = await items.add({ title: "Zapisać do dentysty" });
    expect(item).toEqual({
      id: "solo-1",
      title: "Zapisać do dentysty",
      category: "other",
      weight: 2,
      dueDate: null,
      status: "open",
      doneAt: null,
      shared: false,
    });
    expect(await items.list()).toEqual([item]);
  });

  it("keeps the category, the weight and the due date", async () => {
    const { items } = createSingleDevice();
    await items.add({
      title: "Szczepienie",
      category: "health",
      weight: 3,
      dueDate: "2026-12-24",
    });
    expect(await items.list()).toMatchObject([
      { category: "health", weight: 3, dueDate: "2026-12-24" },
    ]);
  });

  it.each([
    { title: "   " },
    { title: "x".repeat(81) },
    { title: "Rzecz", weight: 4 },
    { title: "Rzecz", category: "nope" as never },
    { title: "Rzecz", dueDate: "2026-02-30" },
    { title: "Rzecz", dueDate: "jutro" },
  ])("throws for %j", async (input) => {
    const { items } = createSingleDevice();
    await expect(items.add(input)).rejects.toBeInstanceOf(ChoreValidationError);
    expect(await items.list()).toEqual([]);
  });

  it("saves only the changed fields and validates the whole item", async () => {
    const { items } = createSingleDevice();
    const { id } = await items.add({ title: "Stary", weight: 3 });
    await items.edit(id, { title: "Nowy", dueDate: "2026-03-01" });
    expect(await items.list()).toMatchObject([
      { title: "Nowy", weight: 3, dueDate: "2026-03-01" },
    ]);
    await items.edit(id, { dueDate: null });
    await expect(items.edit(id, { title: "" })).rejects.toBeInstanceOf(
      ChoreValidationError,
    );
    expect(await items.list()).toMatchObject([
      { title: "Nowy", dueDate: null },
    ]);
  });

  it("completes an item once and keeps it as the archive", async () => {
    const { items } = createSingleDevice();
    const { id } = await items.add({ title: "Rzecz" });
    await items.complete(id);
    const [done] = await items.list();
    expect(done).toMatchObject({ status: "done", doneAt: 1_800_000_000_000 });
    await items.complete(id);
    expect(await items.list()).toEqual([done]);
  });

  it("removes and restores an item", async () => {
    const { items } = createSingleDevice();
    const { id } = await items.add({ title: "Rzecz" });
    await items.remove(id);
    expect(await items.list()).toEqual([]);
    await expect(items.edit(id, { title: "X" })).rejects.toThrow("deleted");
    await expect(items.complete(id)).rejects.toThrow("deleted");
    await items.restore(id);
    expect(await items.list()).toHaveLength(1);
  });

  it("throws for an unknown item", async () => {
    const { items } = createSingleDevice();
    await expect(items.remove("nope")).rejects.toThrow("unknown item");
  });

  it("tells the listeners about a change", async () => {
    const { items } = createSingleDevice();
    const listener = vi.fn();
    const stop = items.subscribe(listener);
    await items.add({ title: "Rzecz" });
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    await items.add({ title: "Druga" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
