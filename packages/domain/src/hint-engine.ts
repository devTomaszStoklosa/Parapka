import type { CheckinAnswers } from "./checkin.js";
import {
  type CalendarDate,
  fromDayNumber,
  toDayNumber,
} from "./cycle-forecast.js";
import type { CyclePhase, CyclePhaseEstimate } from "./cycle-phase.js";

export type HintCategory =
  "relief" | "tenderness" | "attention" | "space" | "appreciation";
export type GrammaticalForm = "feminine" | "masculine" | "neutral";

/** Structurally the same as the template of the content library. */
export interface HintTemplate {
  id: string;
  category: HintCategory;
  text: Record<GrammaticalForm, string>;
}

/** Structurally the same as the rule of the content library. */
export interface EngineRule {
  id: string;
  when: Record<string, unknown>;
  categories: HintCategory[];
  priority: number;
}

export const HINT_ENTRY_DAYS = 3;
export const HINT_HISTORY_DAYS = 14;
export const HINT_NO_REPEAT_DAYS = 7;
export const HINT_DAYS_AHEAD = 3;
const CHECKIN_WEEK_DAYS = 7;

export interface HintDay {
  date: CalendarDate;
  /** The phase estimate of this very day. */
  estimate: CyclePhaseEstimate;
}

export interface HintWellbeingEntry {
  date: CalendarDate;
  energy?: number;
  mood?: number;
}

export interface HintCheckin {
  date: CalendarDate;
  answers: CheckinAnswers;
}

export interface PastHint {
  date: CalendarDate;
  templateId: string;
}

export interface HintEngineInput {
  /** The current date, passed by the caller. */
  today: CalendarDate;
  /** The days to generate hints for, each with its own phase estimate. */
  days: readonly HintDay[];
  entries: readonly HintWellbeingEntry[];
  checkin?: HintCheckin;
  pastHints: readonly PastHint[];
  form: GrammaticalForm;
  rules: readonly EngineRule[];
  templates: readonly HintTemplate[];
  contentVersion: number;
}

/** Contains nothing but these fields (FR-CYC-09). */
export interface GeneratedHint {
  templateId: string;
  contentVersion: number;
  category: HintCategory;
  date: CalendarDate;
  text: string;
}

interface DataPoint {
  source: "entry" | "checkin";
  energy?: number;
  mood?: number;
}

const DATA_KEYS = ["energyMax", "energyMin", "moodMax", "source"];
const KNOWN_KEYS = new Set([...DATA_KEYS, "phase"]);

function isDataRule(rule: EngineRule): boolean {
  return DATA_KEYS.some((key) => key in rule.when);
}

function byPriority(a: EngineRule, b: EngineRule): number {
  return b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function inRange(
  limit: unknown,
  value: number | undefined,
  isOk: (value: number, limit: number) => boolean,
): boolean {
  if (typeof limit !== "number" || value === undefined) return false;
  return isOk(value, limit);
}

function pointMatches(
  when: Record<string, unknown>,
  point: DataPoint,
): boolean {
  if ("source" in when && when.source !== point.source) return false;
  const checks: [
    string,
    number | undefined,
    (v: number, l: number) => boolean,
  ][] = [
    ["energyMax", point.energy, (v, l) => v <= l],
    ["energyMin", point.energy, (v, l) => v >= l],
    ["moodMax", point.mood, (v, l) => v <= l],
  ];
  return checks.every(
    ([key, value, isOk]) => !(key in when) || inRange(when[key], value, isOk),
  );
}

function ruleMatches(
  rule: EngineRule,
  phase: CyclePhase,
  points: readonly DataPoint[],
): boolean {
  const { when } = rule;
  if (Object.keys(when).some((key) => !KNOWN_KEYS.has(key))) return false;
  if ("phase" in when && when.phase !== phase) return false;
  if (!isDataRule(rule)) return true;
  return points.some((point) => pointMatches(when, point));
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A small deterministic generator (mulberry32). */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}

function collectPoints(input: HintEngineInput, today: number): DataPoint[] {
  const points: DataPoint[] = [];
  for (const entry of input.entries) {
    const age = today - toDayNumber(entry.date);
    if (age >= 0 && age < HINT_ENTRY_DAYS) {
      points.push({ source: "entry", energy: entry.energy, mood: entry.mood });
    }
  }
  if (input.checkin) {
    const age = today - toDayNumber(input.checkin.date);
    if (age >= 0 && age < CHECKIN_WEEK_DAYS) {
      points.push({
        source: "checkin",
        energy: input.checkin.answers.energy,
        mood: input.checkin.answers.mood,
      });
    }
  }
  return points;
}

export function generateHints(input: HintEngineInput): GeneratedHint[] {
  const today = toDayNumber(input.today);
  const points = collectPoints(input, today);

  const used: PastHint[] = input.pastHints.filter((hint) => {
    const age = today - toDayNumber(hint.date);
    return age >= 0 && age < HINT_HISTORY_DAYS;
  });

  // Data rules go first whatever the priority (FR-CYC-08).
  const dataRules = input.rules.filter(isDataRule).sort(byPriority);
  const phaseRules = input.rules
    .filter((rule) => !isDataRule(rule))
    .sort(byPriority);
  const ordered = [...dataRules, ...phaseRules];

  const days = [
    ...new Map(input.days.map((day) => [toDayNumber(day.date), day])),
  ]
    .sort(([a], [b]) => a - b)
    .slice(0, HINT_DAYS_AHEAD);

  const result: GeneratedHint[] = [];
  for (const [dayNumber, day] of days) {
    const date = fromDayNumber(dayNumber);
    const blocked = new Set(
      used
        .filter(
          (hint) =>
            Math.abs(dayNumber - toDayNumber(hint.date)) < HINT_NO_REPEAT_DAYS,
        )
        .map((hint) => hint.templateId),
    );
    const hint = pickHint(input, ordered, { day, date, points, blocked });
    if (hint) {
      result.push(hint);
      used.push({ date, templateId: hint.templateId });
    }
  }
  return result;
}

interface DayContext {
  day: HintDay;
  date: CalendarDate;
  points: readonly DataPoint[];
  blocked: ReadonlySet<string>;
}

function pickHint(
  input: HintEngineInput,
  rules: readonly EngineRule[],
  context: DayContext,
): GeneratedHint | undefined {
  const { day, date, points, blocked } = context;
  for (const rule of rules) {
    if (!ruleMatches(rule, day.estimate.phase, points)) continue;
    const random = seeded(hash(`${date}|${rule.id}`));
    for (const category of shuffled(rule.categories, random)) {
      const candidates = input.templates
        .filter((t) => t.category === category && !blocked.has(t.id))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      if (candidates.length === 0) continue;
      const template = candidates[
        Math.floor(random() * candidates.length)
      ] as HintTemplate;
      return {
        templateId: template.id,
        contentVersion: input.contentVersion,
        category,
        date,
        text: template.text[input.form],
      };
    }
  }
  return undefined;
}
