import type { ContentChange } from "@parapka/protocol";
import { describe, expect, it } from "vitest";

import { sanitize, settle, stampPending } from "./hint-codec";

const stamp = "000000000000001-00000-device-a";
const valid = {
  forDate: "2026-11-14",
  text: "Zrób herbatę",
  category: "relief",
  status: "scheduled",
};

const upsert = (values: Record<string, unknown>): ContentChange => ({
  entity: "Hint",
  id: "h1",
  op: "upsert",
  fields: Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      { value, hlc: stamp },
    ]),
  ),
});

describe("sanitize", () => {
  it("keeps a valid change and drops the extra fields", () => {
    const change = sanitize(
      upsert({ ...valid, templateId: "t1", phase: "luteal" }),
    );
    expect(change).toEqual(upsert(valid));
  });

  it.each([
    ["a date that is not YYYY-MM-DD", { forDate: "14.11.2026" }],
    ["an unknown category", { category: "romance" }],
    ["an empty text", { text: "  " }],
    ["a text over 120 characters", { text: "a".repeat(121) }],
    ["an unknown status", { status: "done" }],
    ["a missing field", { text: undefined }],
  ])("rejects %s", (_name, override) => {
    expect(sanitize(upsert({ ...valid, ...override }))).toBeNull();
  });

  it("accepts a text of 120 characters", () => {
    expect(
      sanitize(upsert({ ...valid, text: "a".repeat(120) })),
    ).not.toBeNull();
  });

  it.each(["delete", "restore"] as const)("rejects the op %s", (op) => {
    expect(sanitize({ entity: "Hint", id: "h1", op, hlc: stamp })).toBeNull();
  });
});

describe("stampPending and settle", () => {
  const sent = valid as Parameters<typeof stampPending>[1]["fields"];

  it("stamps exactly the four fields and the life change", () => {
    let counter = 0;
    const next = () => `${stamp}-${String(++counter)}`;
    const changes = stampPending("h1", { fields: sent, life: "delete" }, next);
    expect(changes).toHaveLength(2);
    const [change] = changes;
    expect(Object.keys(change?.op === "upsert" ? change.fields : {})).toEqual([
      "forDate",
      "text",
      "category",
      "status",
    ]);
    expect(changes[1]).toMatchObject({ op: "delete" });
  });

  it("drops from pending what was sent and only that", () => {
    const pending = { fields: sent, life: "delete" as const };
    settle(pending, { entity: "Hint", id: "h1", op: "restore", hlc: stamp });
    expect(pending.life).toBe("delete");
    settle(pending, { entity: "Hint", id: "h1", op: "delete", hlc: stamp });
    settle(pending, upsert(valid));
    expect(pending).toEqual({ fields: null, life: null });
  });

  it("keeps a newer version put while the older one was being sent", () => {
    const newer = { ...valid, text: "Zrób kawę" } as typeof sent;
    const pending = { fields: newer, life: null };
    settle(pending, upsert(valid));
    expect(pending.fields).toEqual(newer);
  });
});
