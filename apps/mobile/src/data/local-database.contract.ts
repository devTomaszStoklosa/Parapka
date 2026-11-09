import { describe, expect, it } from "vitest";
import type { LocalDatabase } from "./local-database";

type Create = () => LocalDatabase | Promise<LocalDatabase>;

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
    expect(await db.get("c", "missing")).toBeNull();
  });

  it("returns the value that was put", async () => {
    const db = await create();
    const value = { a: 1, b: ["x", null, true], c: { d: "ż" } };
    await db.put("c", "1", value);
    expect(await db.get("c", "1")).toEqual(value);
  });

  it("overwrites an existing record", async () => {
    const db = await create();
    await db.put("c", "1", "old");
    await db.put("c", "1", "new");
    expect(await db.get("c", "1")).toBe("new");
  });

  it("keeps collections and ids apart", async () => {
    const db = await create();
    await db.put("a", "1", "a1");
    await db.put("a", "2", "a2");
    await db.put("b", "1", "b1");
    expect(await db.get("a", "1")).toBe("a1");
    expect(await db.get("a", "2")).toBe("a2");
    expect(await db.get("b", "1")).toBe("b1");
  });

  it("is not affected by later changes of the input", async () => {
    const db = await create();
    const value = { list: [1] };
    await db.put("c", "1", value);
    value.list.push(2);
    expect(await db.get("c", "1")).toEqual({ list: [1] });
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
    expect(await db.list("empty")).toEqual([]);
  });
}

function registerRemovalTests(create: Create): void {
  it("deletes one record only", async () => {
    const db = await create();
    await db.put("c", "1", 1);
    await db.put("c", "2", 2);
    await db.delete("c", "1");
    expect(await db.get("c", "1")).toBeNull();
    expect(await db.get("c", "2")).toBe(2);
  });

  it("accepts deleting an unknown record", async () => {
    const db = await create();
    await db.delete("c", "missing");
    expect(await db.get("c", "missing")).toBeNull();
  });

  it("clears all records", async () => {
    const db = await create();
    await db.put("a", "1", 1);
    await db.put("b", "1", 2);
    await db.clear();
    expect(await db.get("a", "1")).toBeNull();
    expect(await db.list("b")).toEqual([]);
  });

  it("accepts writes after clear", async () => {
    const db = await create();
    await db.put("a", "1", 1);
    await db.clear();
    await db.put("a", "1", 3);
    expect(await db.get("a", "1")).toBe(3);
  });
}
