import { describe, expect, it } from "vitest";
import { validateContent } from "./content.js";

const example = {
  schemaVersion: 1,
  changes: [
    {
      entity: "Chore",
      id: "c1",
      op: "upsert",
      fields: { title: { value: "Odkurzanie", hlc: "h1" } },
    },
    { entity: "Hint", id: "h1", op: "delete", hlc: "h2" },
    { entity: "Chore", id: "c1", op: "restore", hlc: "h3" },
  ],
};

function errorFields(input: unknown): string[] {
  const result = validateContent(input);
  return result.ok ? [] : result.errors.map((error) => error.field);
}

describe("validateContent", () => {
  it("accepts upsert, delete and restore", () => {
    expect(validateContent(example)).toEqual({
      ok: true,
      status: "ok",
      value: example,
    });
  });

  it("accepts an empty list of changes", () => {
    expect(validateContent({ schemaVersion: 1, changes: [] }).ok).toBe(true);
  });

  it("rejects a non-object", () => {
    expect(errorFields(undefined)).toEqual(["content"]);
    expect(errorFields([])).toEqual(["content"]);
  });

  it("names missing top-level fields", () => {
    expect(errorFields({})).toEqual(["schemaVersion", "changes"]);
    expect(errorFields({ schemaVersion: "1", changes: {} })).toEqual([
      "schemaVersion",
      "changes",
    ]);
  });

  it("names the field of a bad change with its index", () => {
    const changes = [
      { entity: "Chore", id: "c1", op: "delete" },
      { entity: "", id: 3, op: "restore", hlc: 5 },
      { entity: "Chore", id: "c1", op: "rename" },
      { entity: "Chore", id: "c1" },
      "text",
    ];
    expect(errorFields({ schemaVersion: 1, changes })).toEqual([
      "changes[0].hlc",
      "changes[1].entity",
      "changes[1].id",
      "changes[1].hlc",
      "changes[2].op",
      "changes[3].op",
      "changes[4]",
    ]);
  });

  it("names the field of a bad upsert", () => {
    const upsert = (fields: unknown) => ({
      schemaVersion: 1,
      changes: [{ entity: "Chore", id: "c1", op: "upsert", fields }],
    });
    expect(errorFields(upsert(undefined))).toEqual(["changes[0].fields"]);
    expect(errorFields(upsert([]))).toEqual(["changes[0].fields"]);
    expect(
      errorFields(upsert({ title: { value: "x" }, note: { hlc: "h" } })),
    ).toEqual(["changes[0].fields.title.hlc", "changes[0].fields.note.value"]);
    expect(errorFields(upsert({ title: { value: "x", hlc: 1 } }))).toEqual([
      "changes[0].fields.title.hlc",
    ]);
    expect(errorFields(upsert({ title: "x" }))).toEqual([
      "changes[0].fields.title",
    ]);
  });

  it("keeps unknown fields and entities through a read and write", () => {
    const input = {
      schemaVersion: 1,
      future: { x: 1 },
      changes: [
        {
          entity: "FutureEntity",
          id: "f1",
          op: "upsert",
          extra: [1],
          fields: {
            newField: { value: { deep: true }, hlc: "h1", source: "web" },
          },
        },
        { entity: "Chore", id: "c1", op: "delete", hlc: "h2", why: "x" },
      ],
    };
    const first = validateContent(input);
    if (!first.ok || first.status !== "ok") throw new Error("expected ok");
    const second = validateContent(JSON.parse(JSON.stringify(first.value)));
    expect(second).toEqual({ ok: true, status: "ok", value: input });
  });

  it("does not let a __proto__ field replace the prototype", () => {
    const text = `{"schemaVersion":1,"changes":[{"entity":"Chore","id":"c","op":"upsert","fields":{"__proto__":{"value":1,"hlc":"h"}}}]}`;
    const result = validateContent(JSON.parse(text));
    expect(result.ok).toBe(true);
    if (result.ok && result.status === "ok") {
      const [change] = result.value.changes;
      if (change?.op !== "upsert") throw new Error("expected upsert");
      expect(Object.keys(change.fields)).toEqual(["__proto__"]);
      expect(Object.getPrototypeOf(change.fields)).toBe(Object.prototype);
    }
  });

  it("recognises a higher schemaVersion as needing an update", () => {
    const result = validateContent({ schemaVersion: 2, changes: "new shape" });
    expect(result).toEqual({
      ok: true,
      status: "needs-update",
      schemaVersion: 2,
    });
  });

  it("still rejects an invalid schemaVersion", () => {
    expect(errorFields({ schemaVersion: 0, changes: [] })).toEqual([
      "schemaVersion",
    ]);
  });
});
