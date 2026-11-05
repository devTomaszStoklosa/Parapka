import { describe, expect, it } from "vitest";
import type { CyclePhase, CyclePhaseEstimate } from "./cycle-phase";
import {
  type EngineRule,
  type GeneratedHint,
  type HintCategory,
  type HintDay,
  type HintEngineInput,
  type HintTemplate,
  generateHints,
} from "./hint-engine";

const TODAY = "2027-03-10";
const DATES = ["2027-03-11", "2027-03-12", "2027-03-13"];
const CATEGORIES: HintCategory[] = [
  "relief",
  "tenderness",
  "attention",
  "space",
  "appreciation",
];
const PHASES: CyclePhase[] = [
  "menstruation",
  "follicular",
  "periovulatory",
  "luteal",
  "premenstrual",
];

function estimate(
  phase: CyclePhase,
  extra: Partial<CyclePhaseEstimate> = {},
): CyclePhaseEstimate {
  return {
    phase,
    isIrregular: false,
    confidence: "normal",
    isEstimate: true,
    ...extra,
  };
}

function days(...phases: CyclePhase[]): HintDay[] {
  return DATES.map((date, i) => ({
    date,
    estimate: estimate(phases[i] ?? (phases[0] as CyclePhase)),
  }));
}

const templates: HintTemplate[] = CATEGORIES.flatMap((category) =>
  [1, 2, 3].map((n) => ({
    id: `${category}-${String(n)}`,
    category,
    text: {
      feminine: `${category} ${String(n)} f`,
      masculine: `${category} ${String(n)} m`,
      neutral: `${category} ${String(n)} n`,
    },
  })),
);

const phaseCategories: Record<CyclePhase, HintCategory[]> = {
  menstruation: ["relief", "tenderness"],
  follicular: ["appreciation", "attention"],
  periovulatory: ["attention", "tenderness"],
  luteal: ["space", "appreciation"],
  premenstrual: ["relief", "space", "tenderness"],
};

const rules: EngineRule[] = [
  ...PHASES.map((phase, i) => ({
    id: `phase-${phase}`,
    when: { phase },
    categories: phaseCategories[phase],
    priority: 50 + i,
  })),
  {
    id: "low-energy-follicular",
    when: { phase: "follicular", energyMax: 1 },
    categories: ["relief", "space"],
    priority: 1,
  },
  {
    id: "checkin-low-energy",
    when: { source: "checkin", energyMax: 1 },
    categories: ["relief", "space"],
    priority: 1,
  },
];

function input(extra: Partial<HintEngineInput> = {}): HintEngineInput {
  return {
    today: TODAY,
    days: days("follicular"),
    entries: [],
    pastHints: [],
    form: "feminine",
    rules,
    templates,
    contentVersion: 7,
    ...extra,
  };
}

const datesFrom = (count: number): string[] =>
  Array.from({ length: count }, (_, i) =>
    new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10),
  );

describe("input (criterion 1)", () => {
  it("gives every day the rules of its own phase", () => {
    const result = generateHints(
      input({
        days: days("menstruation", "follicular", "luteal"),
        rules: rules.filter((r) => r.id.startsWith("phase-")),
      }),
    );
    expect(result).toHaveLength(3);
    result.forEach((hint, i) => {
      const phase = (["menstruation", "follicular", "luteal"] as const)[i];
      expect(phaseCategories[phase as CyclePhase]).toContain(hint.category);
    });
  });

  it("ignores entries older than 3 days and a check-in of an earlier week", () => {
    const answers = { mood: 3, energy: 1, closeness: 3 } as const;
    const result = generateHints(
      input({
        entries: [{ date: "2027-03-07", energy: 1 }],
        checkin: { date: "2027-03-01", answers },
      }),
    );
    expect(result[0]?.category).toMatch(/appreciation|attention/);
  });

  it("ignores hints older than 14 days", () => {
    const only = templates.filter((t) => t.id === "appreciation-1");
    const old = generateHints(
      input({
        templates: only,
        rules: [rules[1] as EngineRule],
        pastHints: [{ date: "2027-02-20", templateId: "appreciation-1" }],
      }),
    );
    expect(old).toHaveLength(1);
  });
});

describe("order of rules (criterion 2)", () => {
  it("lets an entry win over a phase rule with a higher priority", () => {
    const result = generateHints(
      input({
        rules: [
          {
            id: "phase-high",
            when: { phase: "follicular" },
            categories: ["attention"],
            priority: 100,
          },
          {
            id: "entry-low",
            when: { source: "entry", energyMax: 2 },
            categories: ["space"],
            priority: 0,
          },
        ],
        entries: [{ date: TODAY, energy: 2 }],
      }),
    );
    expect(result.map((h) => h.category)).toEqual(["space", "space", "space"]);
  });
});

function expectLow(result: GeneratedHint[]): void {
  expect(result).toHaveLength(3);
  for (const hint of result) {
    expect(["relief", "space"]).toContain(hint.category);
  }
}

describe("low energy (criterion 3)", () => {
  it("FR-CYC-08: follicular phase and entry energy 1", () => {
    const result = generateHints(
      input({ entries: [{ date: TODAY, energy: 1 }] }),
    );
    expectLow(result);
  });

  it("FR-CHK-08: check-in energy 1 on the following days", () => {
    const result = generateHints(
      input({
        days: days("luteal"),
        checkin: {
          date: TODAY,
          answers: { mood: 3, energy: 1, closeness: 3 },
        },
      }),
    );
    expectLow(result);
  });
});

describe("one hint per day (criterion 4)", () => {
  it("returns at most 3 deterministic hints with unique dates", () => {
    const many = [...DATES, "2027-03-14", "2027-03-15"].map((date) => ({
      date,
      estimate: estimate("luteal"),
    }));
    const result = generateHints(input({ days: many }));
    expect(result).toHaveLength(3);
    expect(new Set(result.map((h) => h.date)).size).toBe(3);
    expect(generateHints(input({ days: many }))).toEqual(result);
  });

  it("does not repeat a template within 7 days", () => {
    const result = generateHints(
      input({
        templates: templates.filter((t) => t.category === "appreciation"),
        rules: [
          {
            id: "only",
            when: { phase: "follicular" },
            categories: ["appreciation"],
            priority: 1,
          },
        ],
        pastHints: [{ date: "2027-03-08", templateId: "appreciation-1" }],
      }),
    );
    const ids = result.map((h) => h.templateId);
    expect(ids).not.toContain("appreciation-1");
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(2);
  });
});

describe("output (criterion 5)", () => {
  it("contains only the allowed fields and the text of the form", () => {
    const result = generateHints(
      input({
        form: "masculine",
        entries: [{ date: TODAY, energy: 1, mood: 2 }],
      }),
    );
    for (const hint of result) {
      expect(Object.keys(hint).sort()).toEqual([
        "category",
        "contentVersion",
        "date",
        "templateId",
        "text",
      ]);
      expect(hint.contentVersion).toBe(7);
      expect(hint.text).toMatch(/ m$/);
    }
    const json = JSON.stringify(result);
    expect(json).not.toMatch(/follicular|phase|energy|mood|confidence/);
  });
});

describe("categories per phase (criterion 6)", () => {
  it.each(PHASES)("gives %s at least two categories", (phase) => {
    const seen = new Set<string>();
    for (const date of datesFrom(40)) {
      const result = generateHints(
        input({
          today: date,
          days: [{ date, estimate: estimate(phase) }],
          templates,
        }),
      );
      for (const hint of result) seen.add(hint.category);
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });
});

describe("uncertain forecast (criterion 7)", () => {
  const lowDays = (phase: CyclePhase): HintDay[] =>
    DATES.map((date) => ({
      date,
      estimate: estimate(phase, { confidence: "low", isIrregular: true }),
    }));

  it.each(PHASES)("applies phase rules for %s at low confidence", (phase) => {
    const result = generateHints(
      input({
        days: lowDays(phase),
      }),
    );
    expect(result).toHaveLength(3);
    for (const hint of result) {
      expect(phaseCategories[phase]).toContain(hint.category);
    }
  });

  it("still lets an entry win over the phase rule", () => {
    const result = generateHints(
      input({
        days: lowDays("follicular"),
        entries: [{ date: TODAY, energy: 1 }],
      }),
    );
    for (const hint of result) {
      expect(["relief", "space"]).toContain(hint.category);
    }
  });
});

describe("rule conditions", () => {
  const count = (when: Record<string, unknown>): number => {
    const rule = { id: "r", when, categories: ["space"], priority: 1 };
    const entries = [{ date: TODAY, energy: 4, mood: 2 }];
    return generateHints(input({ rules: [rule as EngineRule], entries })).length;
  };

  it("matches energyMin and moodMax and rejects the rest", () => {
    expect(count({ energyMin: 4, moodMax: 2 })).toBe(3);
    expect(count({ energyMin: 5 })).toBe(0);
    expect(count({ moodMax: "2" })).toBe(0);
    expect(count({ phase: "follicular", x: 1 })).toBe(0);
  });
});
