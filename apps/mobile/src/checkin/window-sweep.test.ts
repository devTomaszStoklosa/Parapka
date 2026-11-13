import type { ContentChange } from "@parapka/protocol";
import { expect, it } from "vitest";

import { weekOfChange } from "./window-sweep";

type Upsert = Extract<ContentChange, { op: "upsert" }>;

const change = (fields: Upsert["fields"]): ContentChange => ({
  entity: "CheckInKey",
  id: "x",
  op: "upsert",
  fields,
});
const hlc = "000000000000001-00000-device-a";

it("takes the week from the prefix of the id of the check-in", () => {
  expect(
    weekOfChange(change({ checkinId: { value: "2026-W45:device-a", hlc } })),
  ).toBe("2026-W45");
});

it("gives no week for a change without a valid id of a check-in", () => {
  expect(weekOfChange(change({}))).toBeNull();
  expect(weekOfChange(change({ checkinId: { value: 5, hlc } }))).toBeNull();
  expect(
    weekOfChange(change({ checkinId: { value: "device-a", hlc } })),
  ).toBeNull();
});

it("gives no week for a delete", () => {
  expect(
    weekOfChange({ entity: "CheckInKey", id: "x", op: "delete", hlc }),
  ).toBeNull();
});
