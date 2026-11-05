import { describe, expect, it } from "vitest";
import {
  type CarrierChange,
  type ChoreCompletion,
  type HandoverRequest,
  createHlc,
  currentCarriers,
  currentHandoverRequests,
  mergeCompletions,
} from "./index.js";

const h = (physical: number, counter = 0, device = "a") =>
  createHlc(physical, counter, device);

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((p) => [item, ...p]),
  );
}

const completion = (by: string, hlc: ReturnType<typeof h>, date = "2026-11-05"): ChoreCompletion => ({
  choreId: "c1",
  occurrenceDate: date,
  completedBy: by,
  hlc,
});

describe("mergeCompletions (criterion 1)", () => {
  it("keeps the completion with the smaller HLC for one occurrence", () => {
    const early = completion("A", h(100, 0, "a"));
    const late = completion("B", h(200, 0, "b"));
    expect(mergeCompletions([late, early])).toEqual([early]);
    expect(mergeCompletions([early, late])).toEqual([early]);
  });

  it("keeps separate occurrences and chores apart", () => {
    const d1 = completion("A", h(100), "2026-11-05");
    const d2 = completion("B", h(50), "2026-11-06");
    const other: ChoreCompletion = { ...d1, choreId: "c2" };
    expect(mergeCompletions([d1, d2, other])).toHaveLength(3);
  });
});

describe("currentCarriers (criteria 2 and 3)", () => {
  const initial: CarrierChange = { itemId: "i1", carrierId: "A", hlc: h(100, 0, "a") };
  const takeover: CarrierChange = { itemId: "i1", carrierId: "B", hlc: h(200, 0, "b") };

  it("takes the carrier of the greatest HLC", () => {
    expect(currentCarriers([takeover, initial]).get("i1")).toBe("B");
    expect(currentCarriers([initial, takeover]).get("i1")).toBe("B");
  });

  it("evaluates as of a moment and ignores later entries", () => {
    expect(currentCarriers([initial, takeover], 150).get("i1")).toBe("A");
    expect(currentCarriers([initial, takeover], 200).get("i1")).toBe("B");
    expect(currentCarriers([initial, takeover], 50).has("i1")).toBe(false);
  });

  it("changes the result for the past week once a delayed entry arrives, on both phones", () => {
    const delayed: CarrierChange = { itemId: "i1", carrierId: "B", hlc: h(120, 0, "b") };
    const before = currentCarriers([initial], 150).get("i1");
    const phone1 = currentCarriers([initial, delayed], 150).get("i1");
    const phone2 = currentCarriers([delayed, initial], 150).get("i1");
    expect(before).toBe("A");
    expect(phone1).toBe("B");
    expect(phone2).toBe("B");
  });
});

describe("currentHandoverRequests (criterion 4)", () => {
  const entry = (status: HandoverRequest["status"], physical: number): HandoverRequest => ({
    requestId: "r1",
    itemId: "i1",
    status,
    hlc: h(physical),
  });

  it("takes the latest status by HLC", () => {
    const entries = [entry("pending", 1), entry("accepted", 2), entry("declined", 3)];
    expect(currentHandoverRequests(entries).get("r1")?.status).toBe("declined");
    expect(currentHandoverRequests([entries[1] as HandoverRequest, entries[0] as HandoverRequest]).get("r1")?.status).toBe("accepted");
  });
});

describe("order independence and idempotence (criterion 5)", () => {
  it("gives the same result for every order and duplicates", () => {
    const completions = [
      completion("A", h(100, 0, "a")),
      completion("B", h(100, 0, "a")),
      completion("C", h(300, 0, "c")),
    ];
    const expected = mergeCompletions(completions);
    for (const p of permutations(completions)) {
      expect(mergeCompletions(p)).toEqual(expected);
      expect(mergeCompletions([...p, ...p])).toEqual(expected);
    }

    const carriers: CarrierChange[] = [
      { itemId: "i1", carrierId: "A", hlc: h(100) },
      { itemId: "i1", carrierId: "B", hlc: h(100) },
      { itemId: "i2", carrierId: "A", hlc: h(50) },
    ];
    const expectedCarriers = currentCarriers(carriers);
    for (const p of permutations(carriers)) {
      expect(currentCarriers(p)).toEqual(expectedCarriers);
      expect(currentCarriers([...p, ...p])).toEqual(expectedCarriers);
    }

    const requests: HandoverRequest[] = [
      { requestId: "r1", itemId: "i1", status: "pending", hlc: h(1) },
      { requestId: "r1", itemId: "i1", status: "accepted", hlc: h(1) },
    ];
    const expectedRequests = currentHandoverRequests(requests);
    for (const p of permutations(requests)) {
      expect(currentHandoverRequests(p)).toEqual(expectedRequests);
      expect(currentHandoverRequests([...p, ...p])).toEqual(expectedRequests);
    }
  });
});
