import { describe, expect, it } from "vitest";
import type { Change } from "../../sync/src/merge.js";
import {
  type ContentChange,
  SUPPORTED_SCHEMA_VERSION,
  validateContent,
} from "./index.js";

const hlc = "0000000000001-0000-device";

const valid = {
  schemaVersion: 1,
  changes: [
    {
      entity: "Chore",
      id: "id-1",
      op: "upsert",
      fields: { title: { value: "Odkurzanie", hlc } },
    },
    { entity: "Chore", id: "id-1", op: "delete", hlc },
    { entity: "Chore", id: "id-1", op: "restore", hlc },
  ],
};

const fields = (input: unknown): string[] => {
  const result = validateContent(input);
  return result.ok ? [] : result.errors.map((e) => e.field);
};

describe("validateContent", () => {
  it("accepts upsert, delete and restore", () => {
    expect(validateContent(valid)).toEqual({
      ok: true,
      status: "current",
      value: valid,
    });
  });

  it("returns errors instead of throwing", () => {
    expect(fields("x")).toEqual(["content"]);
    expect(fields({})).toEqual(["schemaVersion"]);
    expect(fields({ schemaVersion: 1 })).toEqual(["changes"]);
    expect(fields({ schemaVersion: 1, changes: {} })).toEqual(["changes"]);
    expect(fields({ schemaVersion: "1", changes: [] })).toEqual([
      "schemaVersion",
    ]);
  });

  it("names the field of a bad change", () => {
    const change = (c: unknown): unknown => ({
      schemaVersion: 1,
      changes: [c],
    });
    expect(fields(change(null))).toEqual(["changes[0]"]);
    expect(fields(change({ entity: "A", id: "1", op: "delete" }))).toEqual([
      "changes[0].hlc",
    ]);
    expect(
      fields(change({ entity: "A", id: "1", op: "restore", hlc: 3 })),
    ).toEqual(["changes[0].hlc"]);
    expect(fields(change({ id: "1", op: "delete", hlc }))).toEqual([
      "changes[0].entity",
    ]);
    expect(fields(change({ entity: "A", id: "1", op: "merge" }))).toEqual([
      "changes[0].op",
    ]);
    expect(fields(change({ entity: "A", id: "1" }))).toEqual(["changes[0].op"]);
    expect(fields(change({ entity: "A", id: "1", op: "upsert" }))).toEqual([
      "changes[0].fields",
    ]);
    expect(
      fields(
        change({
          entity: "A",
          id: "1",
          op: "upsert",
          fields: { t: { value: 1 } },
        }),
      ),
    ).toEqual(["changes[0].fields.t.hlc"]);
    expect(
      fields(
        change({ entity: "A", id: "1", op: "upsert", fields: { t: { hlc } } }),
      ),
    ).toEqual(["changes[0].fields.t.value"]);
  });

  it("keeps unknown fields and entities after a read and write", () => {
    const input = {
      schemaVersion: 1,
      extra: { n: [1, 2] },
      changes: [
        {
          entity: "FutureEntity",
          id: "9",
          op: "upsert",
          note: "x",
          fields: { newField: { value: { deep: true }, hlc, meta: 1 } },
        },
        { entity: "Chore", id: "1", op: "delete", hlc, reason: "y" },
      ],
    };
    const first = validateContent(input);
    expect(first.ok && first.status === "current").toBe(true);
    if (!first.ok || first.status !== "current") return;
    const second = validateContent(JSON.parse(JSON.stringify(first.value)));
    expect(second).toEqual({ ok: true, status: "current", value: input });
  });

  it("recognises a newer schema as needing an update, not an error", () => {
    const result = validateContent({
      schemaVersion: SUPPORTED_SCHEMA_VERSION + 1,
      changes: "new shape",
    });
    expect(result).toEqual({
      ok: true,
      status: "needs-update",
      schemaVersion: SUPPORTED_SCHEMA_VERSION + 1,
    });
  });

  it("keeps ContentChange compatible with Change of sync", () => {
    const change: ContentChange = {
      entity: "Chore",
      id: "1",
      op: "restore",
      hlc,
    };
    const asSync: Change = change as Change;
    expect(asSync.op).toBe("restore");
  });
});
