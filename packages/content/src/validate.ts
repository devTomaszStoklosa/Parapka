import {
  GRAMMATICAL_FORMS,
  HINT_CATEGORIES,
  PHASES,
  REVIEW_STATUSES,
  type ContentFile,
  type EngineRule,
  type HintTemplate,
  type PhaseDescription,
  type ValidationError,
  type ValidationResult,
} from "./types.js";

type Obj = Record<string, unknown>;
type Fail = (message: string) => void;

const isObject = (value: unknown): value is Obj =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isOneOf = (list: readonly string[], value: unknown): boolean =>
  typeof value === "string" && list.includes(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

function describe(index: number, raw: unknown): string {
  const key = isObject(raw) ? (raw["id"] ?? raw["phase"]) : undefined;
  return typeof key === "string"
    ? `entries[${String(index)}] (${JSON.stringify(key)})`
    : `entries[${String(index)}]`;
}

function checkOneOf(
  raw: Obj,
  field: string,
  list: readonly string[],
  fail: Fail,
): void {
  if (!(field in raw)) fail(`missing field "${field}"`);
  else if (!isOneOf(list, raw[field]))
    fail(
      `unknown ${field} ${JSON.stringify(raw[field])}, expected one of ${list.join(", ")}`,
    );
}

function checkText(raw: Obj, fail: Fail): void {
  if (!("text" in raw)) {
    fail(`missing field "text"`);
    return;
  }
  const text = raw["text"];
  if (!isObject(text)) {
    fail(`field "text" must be an object`);
    return;
  }
  for (const form of GRAMMATICAL_FORMS) {
    if (!(form in text)) fail(`missing grammatical form "${form}" in "text"`);
    else if (!isNonEmptyString(text[form]))
      fail(`grammatical form "${form}" in "text" must be a non-empty string`);
  }
}

function checkId(raw: Obj, fail: Fail): void {
  if (!("id" in raw)) fail(`missing field "id"`);
  else if (!isNonEmptyString(raw["id"]))
    fail(`field "id" must be a non-empty string`);
}

function validateFile<T>(
  file: string,
  data: unknown,
  checkEntry: (raw: Obj, fail: Fail) => void,
  uniqueKey: "id" | "phase",
): ValidationResult<T> {
  const errors: ValidationError[] = [];
  const add = (entry: string, message: string) =>
    errors.push({ file, entry, message });

  if (!isObject(data)) {
    add("", "file must contain a JSON object");
    return { ok: false, errors };
  }
  const version = data["contentVersion"];
  if (!("contentVersion" in data)) add("", `missing field "contentVersion"`);
  else if (!Number.isInteger(version) || (version as number) < 1)
    add("", `"contentVersion" must be a positive integer`);

  const entries = data["entries"];
  if (!("entries" in data)) add("", `missing field "entries"`);
  else if (!Array.isArray(entries)) add("", `"entries" must be an array`);
  else {
    const seen = new Set<string>();
    entries.forEach((raw: unknown, index) => {
      const label = describe(index, raw);
      if (!isObject(raw)) {
        add(label, "entry must be an object");
        return;
      }
      checkEntry(raw, (message) => add(label, message));
      const key = raw[uniqueKey];
      if (typeof key === "string") {
        if (seen.has(key))
          add(label, `duplicate ${uniqueKey} ${JSON.stringify(key)}`);
        seen.add(key);
      }
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: data as unknown as ContentFile<T> };
}

export function validatePhaseFile(
  file: string,
  data: unknown,
): ValidationResult<PhaseDescription> {
  return validateFile(
    file,
    data,
    (raw, fail) => {
      checkOneOf(raw, "phase", PHASES, fail);
      checkText(raw, fail);
      checkOneOf(raw, "review", REVIEW_STATUSES, fail);
    },
    "phase",
  );
}

export function validateHintTemplateFile(
  file: string,
  data: unknown,
): ValidationResult<HintTemplate> {
  return validateFile(
    file,
    data,
    (raw, fail) => {
      checkId(raw, fail);
      checkOneOf(raw, "category", HINT_CATEGORIES, fail);
      checkText(raw, fail);
      checkOneOf(raw, "review", REVIEW_STATUSES, fail);
    },
    "id",
  );
}

function checkCategories(raw: Obj, fail: Fail): void {
  const categories = raw["categories"];
  if (!("categories" in raw)) {
    fail(`missing field "categories"`);
    return;
  }
  if (!Array.isArray(categories) || categories.length === 0) {
    fail(`field "categories" must be a non-empty array`);
    return;
  }
  for (const category of categories as unknown[])
    if (!isOneOf(HINT_CATEGORIES, category))
      fail(
        `unknown category ${JSON.stringify(category)}, expected one of ${HINT_CATEGORIES.join(", ")}`,
      );
}

export function validateEngineRuleFile(
  file: string,
  data: unknown,
): ValidationResult<EngineRule> {
  return validateFile(
    file,
    data,
    (raw, fail) => {
      checkId(raw, fail);
      if (!("when" in raw)) fail(`missing field "when"`);
      else if (!isObject(raw["when"])) fail(`field "when" must be an object`);
      checkCategories(raw, fail);
      if (!("priority" in raw)) fail(`missing field "priority"`);
      else if (
        typeof raw["priority"] !== "number" ||
        !Number.isFinite(raw["priority"])
      )
        fail(`field "priority" must be a number`);
    },
    "id",
  );
}
