import { describe, expect, it } from "vitest";
import type { LocalDatabase } from "./local-database";

type Create = () => LocalDatabase | Promise<LocalDatabase>;

/** Registers the contract tests every LocalDatabase implementation must pass. */
export function describeLocalDatabaseContract(
  name: string,
  create: Create,
): void {
  describe(`LocalDatabase contract: ${name}`, () => {
    registerReadWriteTests(create);
    registerRemovalTests(create);
  });
}

function registerReadWriteTests(create: Create): void {
  it("returns null for an unknown record", async () => {
    const db = await create();
    expect(await db.get("notes", "missing")).toBeNull();
  });

  it("returns the value that was put", async () => {
    const db = await create();
    const value = { text: "zażółć", list: [1, true, null], nested: { a: "b" } };
    await db.put("notes", "1", value);
    expect(await db.get("notes", "1")).toEqual(value);
  });

  it("overwrites an existing record", async () => {
    const db = await create();
    await db.put("notes", "1", "a");
    await db.put("notes", "1", "b");
    expect(await db.get("notes", "1")).toBe("b");
  });

  it("keeps collections and ids apart", async () => {
    const db = await create();
    await db.put("a", "1", "a1");
    await db.put("b", "1", "b1");
    await db.put("a", "2", "a2");
    expect(await db.get("a", "1")).toBe("a1");
    expect(await db.get("b", "1")).toBe("b1");
    expect(await db.get("a", "2")).toBe("a2");
  });

  it("is not affected by later changes of the input", async () => {
    const db = await create();
    const value = { n: 1 };
    await db.put("notes", "1", value);
    value.n = 2;
    expect(await db.get("notes", "1")).toEqual({ n: 1 });
  });

  it("lists the records of one collection ordered by id", async () => {
    const db = await create();
    await db.put("a", "2", "two");
    await db.put("a", "1", "one");
    await db.put("b", "1", "other");
    expect(await db.list("a")).toEqual([
      { id: "1", value: "one" },
      { id: "2", value: "two" },
    ]);
  });

  it("lists nothing for an unknown collection", async () => {
    const db = await create();
    expect(await db.list("missing")).toEqual([]);
  });
}

function registerRemovalTests(create: Create): void {
  it("deletes one record only", async () => {
    const db = await create();
    await db.put("a", "1", "x");
    await db.put("a", "2", "y");
    await db.delete("a", "1");
    expect(await db.get("a", "1")).toBeNull();
    expect(await db.get("a", "2")).toBe("y");
  });

  it("accepts deleting an unknown record", async () => {
    const db = await create();
    await db.delete("a", "missing");
    expect(await db.get("a", "missing")).toBeNull();
  });

  it("clears all records", async () => {
    const db = await create();
    await db.put("a", "1", "x");
    await db.put("b", "1", "y");
    await db.clear();
    expect(await db.get("a", "1")).toBeNull();
    expect(await db.list("b")).toEqual([]);
  });
}
