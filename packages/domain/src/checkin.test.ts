import { describe, expect, it } from "vitest";
import {
  ChoreValidationError,
  DEFAULT_CHECKIN_SCHEDULE,
  checkinWindowEndDecision,
  createCheckinAnswers,
  currentCheckinWindow,
  editCheckinAnswers,
  type CheckinState,
} from "./index.js";

const at = (
  [year, month, day]: [number, number, number],
  hour = 0,
  minute = 0,
) => ({ year, month, day, hour, minute });

describe("currentCheckinWindow", () => {
  it("defaults to Sunday 19:00", () => {
    expect(DEFAULT_CHECKIN_SCHEDULE).toEqual({
      weekday: 7,
      hour: 19,
      minute: 0,
    });
  });

  it("opens exactly at the scheduled time", () => {
    // 2026-11-08 is a Sunday.
    const w = currentCheckinWindow(at([2026, 11, 8], 19, 0));
    expect(w.start).toEqual(at([2026, 11, 8], 19, 0));
    expect(w.end).toEqual(at([2026, 11, 15], 19, 0));
    expect(w.week).toBe("2026-W45");
  });

  it("still belongs to the previous window one minute before", () => {
    const w = currentCheckinWindow(at([2026, 11, 8], 18, 59));
    expect(w.start).toEqual(at([2026, 11, 1], 19, 0));
    expect(w.end).toEqual(at([2026, 11, 8], 19, 0));
    expect(w.week).toBe("2026-W44");
  });

  it("works in the middle of the week", () => {
    const w = currentCheckinWindow(at([2026, 11, 5], 12, 0));
    expect(w.start).toEqual(at([2026, 11, 1], 19, 0));
  });

  it("crosses the year boundary", () => {
    const w = currentCheckinWindow(at([2027, 1, 1], 10, 0));
    expect(w.start).toEqual(at([2026, 12, 27], 19, 0));
    expect(w.end).toEqual(at([2027, 1, 3], 19, 0));
    expect(w.week).toBe("2026-W52");
  });

  it("uses the ISO year for the week", () => {
    const w = currentCheckinWindow(at([2026, 12, 28], 10, 0), {
      weekday: 1,
      hour: 8,
      minute: 0,
    });
    expect(w.week).toBe("2026-W53");
    expect(
      currentCheckinWindow(at([2027, 1, 4], 9, 0), {
        weekday: 1,
        hour: 8,
        minute: 0,
      }).week,
    ).toBe("2027-W01");
  });

  it("crosses a month boundary", () => {
    const w = currentCheckinWindow(at([2026, 3, 2], 10, 0));
    expect(w.start).toEqual(at([2026, 3, 1], 19, 0));
    expect(w.end).toEqual(at([2026, 3, 8], 19, 0));
    const w2 = currentCheckinWindow(at([2026, 3, 1], 10, 0));
    expect(w2.start).toEqual(at([2026, 2, 22], 19, 0));
  });

  it("follows a schedule change in the middle of the week", () => {
    const now = at([2026, 11, 5], 12, 0); // Thursday
    const before = currentCheckinWindow(now);
    const after = currentCheckinWindow(now, {
      weekday: 3,
      hour: 20,
      minute: 30,
    });
    expect(before.start).toEqual(at([2026, 11, 1], 19, 0));
    expect(after.start).toEqual(at([2026, 11, 4], 20, 30));
    expect(after.end).toEqual(at([2026, 11, 11], 20, 30));
    expect(after.week).toBe("2026-W45");
  });

  it("rejects an invalid schedule", () => {
    expect(() =>
      currentCheckinWindow(at([2026, 11, 5]), {
        weekday: 7,
        hour: 24,
        minute: 0,
      }),
    ).toThrow(ChoreValidationError);
    expect(() =>
      currentCheckinWindow(at([2026, 11, 5]), {
        weekday: 8 as never,
        hour: 1,
        minute: 0,
      }),
    ).toThrow(ChoreValidationError);
    expect(() =>
      currentCheckinWindow(at([2026, 11, 5]), {
        weekday: 1,
        hour: 1,
        minute: 60,
      }),
    ).toThrow(ChoreValidationError);
  });

  it("rejects an invalid date", () => {
    expect(() => currentCheckinWindow(at([2026, Number.NaN, 5]))).toThrow(
      ChoreValidationError,
    );
  });

  it.each([
    ["2026-02-30", at([2026, 2, 30])],
    ["2027-02-29", at([2027, 2, 29])],
    ["month 13", at([2026, 13, 1])],
    ["month 0", at([2026, 0, 1])],
    ["hour 24", at([2026, 11, 5], 24, 0)],
    ["minute 60", at([2026, 11, 5], 12, 60)],
    ["fractional day", at([2026, 11, 5.5])],
    ["fractional hour", at([2026, 11, 5], 1.5, 0)],
    ["year 99", at([99, 11, 5])],
    ["year 10000", at([10000, 1, 1])],
  ])("rejects %s", (_name, local) => {
    expect(() => currentCheckinWindow(local)).toThrow(ChoreValidationError);
  });

  it("accepts 2028-02-29", () => {
    const w = currentCheckinWindow(at([2028, 2, 29], 10, 0));
    expect(w.start).toEqual(at([2028, 2, 27], 19, 0));
  });
});

describe("createCheckinAnswers", () => {
  it("accepts values from 1 to 5 and an optional need", () => {
    expect(createCheckinAnswers({ mood: 1, energy: 3, closeness: 5 })).toEqual({
      mood: 1,
      energy: 3,
      closeness: 5,
    });
    const need = "x".repeat(140);
    expect(
      createCheckinAnswers({ mood: 2, energy: 2, closeness: 2, need }).need,
    ).toBe(need);
  });

  it.each([0, 6, 3.5, Number.NaN])("rejects score %s", (bad) => {
    expect(() =>
      createCheckinAnswers({ mood: bad, energy: 3, closeness: 3 }),
    ).toThrow(ChoreValidationError);
    expect(() =>
      createCheckinAnswers({ mood: 3, energy: bad, closeness: 3 }),
    ).toThrow(ChoreValidationError);
    expect(() =>
      createCheckinAnswers({ mood: 3, energy: 3, closeness: bad }),
    ).toThrow(ChoreValidationError);
  });

  it("rejects a need over 140 characters or not text", () => {
    expect(() =>
      createCheckinAnswers({
        mood: 3,
        energy: 3,
        closeness: 3,
        need: "x".repeat(141),
      }),
    ).toThrow(ChoreValidationError);
    expect(() =>
      createCheckinAnswers({
        mood: 3,
        energy: 3,
        closeness: 3,
        need: 5 as never,
      }),
    ).toThrow(ChoreValidationError);
  });
});

describe("editCheckinAnswers", () => {
  const answers = createCheckinAnswers({ mood: 3, energy: 3, closeness: 3 });
  const next = createCheckinAnswers({ mood: 5, energy: 4, closeness: 2 });

  it("lets the author edit until both have filled in", () => {
    const state: CheckinState = { answers, partnerFilled: false };
    expect(editCheckinAnswers(state, next).answers).toEqual(next);
  });

  it("fails once both have filled in", () => {
    expect(() =>
      editCheckinAnswers({ answers, partnerFilled: true }, next),
    ).toThrow(ChoreValidationError);
  });

  it("validates the new answers", () => {
    expect(() =>
      editCheckinAnswers(
        { answers, partnerFilled: false },
        { ...next, mood: 9 as never },
      ),
    ).toThrow(ChoreValidationError);
  });
});

describe("checkinWindowEndDecision", () => {
  const answers = createCheckinAnswers({ mood: 3, energy: 3, closeness: 3 });

  it("keeps own answers author-only and deletes sealed partner answers", () => {
    expect(checkinWindowEndDecision({ answers, partnerFilled: false })).toEqual(
      {
        kind: "incomplete",
        ownAnswers: "author-only",
        sealedPartnerAnswers: "delete",
      },
    );
  });

  it("reveals when both filled in", () => {
    expect(checkinWindowEndDecision({ answers, partnerFilled: true })).toEqual({
      kind: "revealed",
    });
  });
});

describe("partner state is not disclosed (ZP-2)", () => {
  it("returns no field about the partner before the reveal", () => {
    const answers = createCheckinAnswers({ mood: 3, energy: 3, closeness: 3 });
    const decision = checkinWindowEndDecision({
      answers,
      partnerFilled: false,
    });
    expect(Object.keys(decision).sort()).toEqual([
      "kind",
      "ownAnswers",
      "sealedPartnerAnswers",
    ]);
  });

  it("rejects editing once the partner has filled in", () => {
    const answers = createCheckinAnswers({ mood: 3, energy: 3, closeness: 3 });
    expect(() =>
      editCheckinAnswers({ answers, partnerFilled: true }, answers),
    ).toThrow("check-in answers can no longer be changed");
  });
});
