import { describe, expect, it } from "vitest";
import type { Chore } from "./chore.js";
import {
  ChoreValidationError,
  filterChores,
  releaseChore,
  reminderRecipients,
  responsibleFor,
  type Assignment,
} from "./index.js";

const daily: Chore = { id: "d", title: "Daily", rule: { kind: "daily" } };
const alt: Assignment = {
  kind: "alternating",
  firstPerson: "partner",
  startDate: "2025-01-30",
};

describe("alternating", () => {
  it("alternates daily occurrences across a month boundary", () => {
    const who = ["2025-01-30", "2025-01-31", "2025-02-01", "2025-02-02"].map(
      (d) => responsibleFor(daily, alt, d),
    );
    expect(who).toEqual(["partner", "me", "partner", "me"]);
  });

  it("counts occurrences of every N days", () => {
    const chore: Chore = {
      id: "n",
      title: "N",
      rule: { kind: "everyNDays", interval: 3, startDate: "2025-01-30" },
    };
    expect(responsibleFor(chore, alt, "2025-02-02")).toBe("me");
    expect(responsibleFor(chore, alt, "2025-02-05")).toBe("partner");
  });

  it("counts selected weekdays", () => {
    const chore: Chore = {
      id: "w",
      title: "W",
      rule: { kind: "weekdays", weekdays: [1, 4] },
    };
    // 2025-01-30 is Thursday; next Monday 02-03, Thursday 02-06.
    expect(responsibleFor(chore, alt, "2025-01-30")).toBe("partner");
    expect(responsibleFor(chore, alt, "2025-02-03")).toBe("me");
    expect(responsibleFor(chore, alt, "2025-02-06")).toBe("partner");
  });

  it("is deterministic", () => {
    expect(responsibleFor(daily, alt, "2025-03-10")).toBe(
      responsibleFor({ ...daily }, { ...alt }, "2025-03-10"),
    );
  });

  it("rejects a date before the start", () => {
    expect(() => responsibleFor(daily, alt, "2025-01-29")).toThrow(
      ChoreValidationError,
    );
  });
});

describe("assignment validation", () => {
  it("rejects an unknown person", () => {
    const person = {
      kind: "person",
      person: "nobody",
    } as unknown as Assignment;
    expect(() => responsibleFor(daily, person, "2025-01-30")).toThrow(
      ChoreValidationError,
    );
  });

  it("rejects an unknown first person of an alternating assignment", () => {
    const bad = {
      kind: "alternating",
      firstPerson: "nobody",
      startDate: "2025-01-30",
    } as unknown as Assignment;
    expect(() => responsibleFor(daily, bad, "2025-01-30")).toThrow(
      ChoreValidationError,
    );
  });
});

describe("reminder recipients", () => {
  const date = "2025-01-31";
  it("goes to the responsible person only", () => {
    expect(
      reminderRecipients(daily, { kind: "person", person: "partner" }, date),
    ).toEqual(["partner"]);
    expect(reminderRecipients(daily, alt, date)).toEqual(["me"]);
    expect(reminderRecipients(daily, alt, "2025-02-01")).toEqual(["partner"]);
  });
  it("goes to both for both and anyone", () => {
    expect(reminderRecipients(daily, { kind: "both" }, date)).toEqual([
      "me",
      "partner",
    ]);
    expect(reminderRecipients(daily, { kind: "anyone" }, date)).toEqual([
      "me",
      "partner",
    ]);
  });
});

describe("release", () => {
  it("makes anyone responsible and returns nothing else", () => {
    const released = releaseChore();
    expect(released).toEqual({ kind: "anyone" });
    expect(responsibleFor(daily, released, "2025-01-31")).toBe("anyone");
  });
});

describe("filters", () => {
  const items = [
    { chore: daily, assignment: { kind: "person", person: "me" } },
    {
      chore: { ...daily, id: "p" },
      assignment: { kind: "person", person: "partner" },
    },
    { chore: { ...daily, id: "b" }, assignment: { kind: "both" } },
    { chore: { ...daily, id: "a" }, assignment: { kind: "anyone" } },
    { chore: { ...daily, id: "t" }, assignment: alt },
  ] as const;
  const ids = (filter: "mine" | "partner" | "shared", date: string) =>
    filterChores(items, filter, date).map((i) => i.chore.id);

  it("mine", () => {
    expect(ids("mine", "2025-01-31")).toEqual(["d", "t"]);
  });
  it("partner includes alternating on the partner's turn", () => {
    expect(ids("partner", "2025-01-31")).toEqual(["p"]);
    expect(ids("partner", "2025-02-01")).toEqual(["p", "t"]);
  });
  it("shared", () => {
    expect(ids("shared", "2025-01-31")).toEqual(["b", "a"]);
  });
});
