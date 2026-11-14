import { describe, expect, it } from "vitest";
import {
  type Change,
  type EntityState,
  applyChange,
  createHlc,
  emptyEntityState,
  entityValues,
  formatHlc,
  isAlive,
} from "./index.js";

const h = (physical: number, counter: number, device: string): string =>
  formatHlc(createHlc(physical, counter, device));

const upsert = (fields: Record<string, [unknown, string]>): Change => ({
  entity: "Chore",
  id: "c1",
  op: "upsert",
  fields: Object.fromEntries(
    Object.entries(fields).map(([k, [value, hlc]]) => [k, { value, hlc }]),
  ),
});
const del = (hlc: string): Change => ({
  entity: "Chore",
  id: "c1",
  op: "delete",
  hlc,
});
const restore = (hlc: string): Change => ({
  entity: "Chore",
  id: "c1",
  op: "restore",
  hlc,
});

const fold = (changes: Change[]): EntityState =>
  changes.reduce(applyChange, emptyEntityState("Chore", "c1"));

describe("Hint", () => {
  const hint = (text: string, hlc: string): Change => ({
    entity: "Hint",
    id: "h1",
    op: "upsert",
    fields: { text: { value: text, hlc } },
  });

  it("replaces the version of a day with a newer one, never with an older", () => {
    const [old, next] = [hint("old", h(1, 0, "a")), hint("new", h(2, 0, "a"))];
    const state = (changes: Change[]) =>
      changes.reduce(applyChange, emptyEntityState("Hint", "h1"));
    expect(state([old, next]).fields.text?.value).toBe("new");
    expect(state([next, old]).fields.text?.value).toBe("new");
    expect(state([next, next]).entity).toBe("Hint");
  });
});

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [
      item,
      ...rest,
    ]),
  );
}

describe("per-field last write wins", () => {
  it("keeps the value with the greater HLC", () => {
    const old = upsert({ title: ["old", h(1, 0, "a")] });
    const next = upsert({ title: ["new", h(2, 0, "a")] });
    expect(entityValues(fold([next, old]))).toEqual({ title: "new" });
    expect(entityValues(fold([old, next]))).toEqual({ title: "new" });
  });

  it("compares counter before deviceId", () => {
    const a = upsert({ title: ["a", h(5, 1, "a")] });
    const b = upsert({ title: ["b", h(5, 0, "z")] });
    expect(entityValues(fold([b, a]))).toEqual({ title: "a" });
  });

  it("breaks a tie by deviceId", () => {
    const a = upsert({ title: ["a", h(5, 0, "a")] });
    const b = upsert({ title: ["b", h(5, 0, "b")] });
    expect(entityValues(fold([a, b]))).toEqual({ title: "b" });
    expect(entityValues(fold([b, a]))).toEqual({ title: "b" });
  });

  it("FR-CHR-06: title from A and due date from B", () => {
    const a = upsert({ title: ["Zmywanie", h(10, 0, "a")] });
    const b = upsert({ dueDate: ["2026-01-02", h(11, 0, "b")] });
    const expected = { title: "Zmywanie", dueDate: "2026-01-02" };
    expect(entityValues(fold([a, b]))).toEqual(expected);
    expect(entityValues(fold([b, a]))).toEqual(expected);
  });
});

describe("tombstone", () => {
  it("keeps the entity deleted despite a later edit", () => {
    const state = fold([
      upsert({ title: ["x", h(1, 0, "a")] }),
      del(h(2, 0, "a")),
      upsert({ title: ["y", h(3, 0, "b")] }),
    ]);
    expect(isAlive(state)).toBe(false);
    expect(entityValues(state)).toBeNull();
    expect(state.deletedAt).toBe(h(2, 0, "a"));
  });

  it("ignores a restore earlier than the tombstone", () => {
    expect(isAlive(fold([del(h(5, 0, "a")), restore(h(4, 0, "b"))]))).toBe(
      false,
    );
  });

  it("revives with a restore later than the tombstone", () => {
    const state = fold([
      upsert({ title: ["x", h(1, 0, "a")] }),
      del(h(5, 0, "a")),
      restore(h(6, 0, "b")),
    ]);
    expect(entityValues(state)).toEqual({ title: "x" });
  });

  it("rejects a change for another entity", () => {
    expect(() =>
      applyChange(emptyEntityState("Chore", "c2"), del(h(1, 0, "a"))),
    ).toThrow(TypeError);
  });
});

describe("convergence", () => {
  const set: Change[] = [
    upsert({ title: ["a", h(1, 0, "a")], dueDate: ["d1", h(1, 0, "a")] }),
    upsert({ title: ["b", h(2, 0, "b")] }),
    del(h(3, 0, "a")),
    restore(h(4, 0, "b")),
    upsert({ dueDate: ["d2", h(5, 0, "b")], extra: [1, h(5, 0, "b")] }),
  ];

  it("gives the same state for every order", () => {
    const expected = fold(set);
    for (const order of permutations(set)) {
      expect(fold(order)).toEqual(expected);
    }
    expect(entityValues(expected)).toEqual({
      title: "b",
      dueDate: "d2",
      extra: 1,
    });
  });

  it("is idempotent", () => {
    const once = fold(set);
    expect(fold([...set, ...set])).toEqual(once);
    for (const change of set) {
      expect(applyChange(once, change)).toEqual(once);
    }
  });
});

describe("unknown fields", () => {
  it("are preserved with their values", () => {
    const state = fold([
      upsert({ title: ["x", h(1, 0, "a")] }),
      upsert({ futureField: [{ nested: [1, 2] }, h(2, 0, "b")] }),
    ]);
    expect(entityValues(state)).toEqual({
      title: "x",
      futureField: { nested: [1, 2] },
    });
  });

  it("keeps fields named like Object.prototype members", () => {
    const first: Record<string, [unknown, string]> = {};
    first["constructor"] = ["c", h(1, 0, "a")];
    const second: Record<string, [unknown, string]> = {};
    second["constructor"] = ["d", h(2, 0, "b")];
    second["toString"] = [1, h(1, 0, "a")];
    const state = fold([
      upsert(first),
      upsert(second),
      {
        entity: "Chore",
        id: "c1",
        op: "upsert",
        fields: JSON.parse(
          '{"__proto__":{"value":"p","hlc":"' + h(1, 0, "a") + '"}}',
        ) as Record<string, { value: unknown; hlc: string }>,
      },
    ]);
    const values = entityValues(state) as Record<string, unknown>;
    expect(Object.getOwnPropertyDescriptor(values, "constructor")?.value).toBe(
      "d",
    );
    expect(Object.getOwnPropertyDescriptor(values, "toString")?.value).toBe(1);
    expect(Object.getOwnPropertyDescriptor(values, "__proto__")?.value).toBe(
      "p",
    );
  });
});
