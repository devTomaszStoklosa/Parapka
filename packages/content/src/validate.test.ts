import { describe, expect, it } from "vitest";
import { formatError, loadLibrary } from "./library.js";
import {
  validateEngineRuleFile,
  validateHintTemplateFile,
  validatePhaseFile,
} from "./validate.js";

const text = { feminine: "a", masculine: "b", neutral: "c" };
const phase = { phase: "luteal", text, review: "unreviewed" };
const template = { id: "t1", category: "relief", text, review: "reviewed" };
const rule = {
  id: "r1",
  when: { energyMax: 2 },
  categories: ["relief", "space"],
  priority: 10,
};
const file = (entries: unknown[], extra: object = {}) => ({
  contentVersion: 1,
  entries,
  ...extra,
});

function errorsOf(
  result: { ok: true } | { ok: false; errors: { message: string }[] },
) {
  return result.ok ? [] : result.errors;
}

describe("valid files", () => {
  it("accepts all three kinds", () => {
    expect(validatePhaseFile("phases.json", file([phase])).ok).toBe(true);
    expect(validateHintTemplateFile("h.json", file([template])).ok).toBe(true);
    expect(validateEngineRuleFile("r.json", file([rule])).ok).toBe(true);
  });
});

describe("rejections", () => {
  it("rejects a missing field and names file and entry", () => {
    const noId: Record<string, unknown> = { ...template };
    delete noId["id"];
    const errors = errorsOf(validateHintTemplateFile("h.json", file([noId])));
    expect(errors).toEqual([
      { file: "h.json", entry: "entries[0]", message: 'missing field "id"' },
    ]);
  });

  it("rejects a missing review status", () => {
    const noReview: Record<string, unknown> = { ...phase };
    delete noReview["review"];
    const errors = errorsOf(validatePhaseFile("p.json", file([noReview])));
    expect(errors[0]?.message).toContain('missing field "review"');
  });

  it("rejects an unknown category", () => {
    const bad = { ...template, category: "pressure" };
    const errors = errorsOf(validateHintTemplateFile("h.json", file([bad])));
    expect(errors[0]).toMatchObject({
      file: "h.json",
      entry: 'entries[0] ("t1")',
    });
    expect(errors[0]?.message).toContain("unknown category");
  });

  it("rejects an unknown category in a rule", () => {
    const bad = { ...rule, categories: ["relief", "nope"] };
    const errors = errorsOf(validateEngineRuleFile("r.json", file([bad])));
    expect(errors[0]?.message).toContain("unknown category");
  });

  it("rejects an unknown phase", () => {
    const bad = { ...phase, phase: "ovulation" };
    const errors = errorsOf(validatePhaseFile("p.json", file([bad])));
    expect(errors[0]?.message).toContain("unknown phase");
  });

  it("rejects a missing grammatical form", () => {
    const bad = { ...phase, text: { feminine: "a", masculine: "b" } };
    const errors = errorsOf(validatePhaseFile("p.json", file([bad])));
    expect(errors[0]?.message).toContain('missing grammatical form "neutral"');
  });

  it("rejects a duplicate id", () => {
    const errors = errorsOf(
      validateHintTemplateFile("h.json", file([template, template])),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ file: "h.json" });
    expect(errors[0]).toHaveProperty("entry", 'entries[1] ("t1")');
    expect(errors[0]?.message).toContain("duplicate id");
  });

  it("rejects a duplicate phase", () => {
    const errors = errorsOf(validatePhaseFile("p.json", file([phase, phase])));
    expect(errors[0]?.message).toContain("duplicate phase");
  });

  it("rejects a file without contentVersion", () => {
    const errors = errorsOf(
      validateEngineRuleFile("r.json", { entries: [rule] }),
    );
    expect(errors).toEqual([
      { file: "r.json", entry: "", message: 'missing field "contentVersion"' },
    ]);
  });

  it("rejects an invalid contentVersion and a non-object file", () => {
    expect(
      validatePhaseFile("p.json", file([phase], { contentVersion: 0 })).ok,
    ).toBe(false);
    expect(validatePhaseFile("p.json", []).ok).toBe(false);
  });

  it("collects errors from many entries", () => {
    const errors = errorsOf(
      validateEngineRuleFile("r.json", file([{}, { id: "x" }])),
    );
    expect(errors.length).toBeGreaterThan(4);
  });
});

describe("structural rejections", () => {
  const msgs = (r: Parameters<typeof errorsOf>[0]) =>
    errorsOf(r).map((e) => e.message);

  it("rejects a missing or malformed entries list", () => {
    expect(msgs(validatePhaseFile("p.json", { contentVersion: 1 }))).toEqual([
      'missing field "entries"',
    ]);
    expect(
      msgs(validatePhaseFile("p.json", { contentVersion: 1, entries: {} })),
    ).toEqual(['"entries" must be an array']);
  });

  it("rejects a non-object entry and a non-integer version", () => {
    const result = validatePhaseFile(
      "p.json",
      file([5], { contentVersion: 1.5 }),
    );
    expect(msgs(result)).toEqual([
      '"contentVersion" must be a positive integer',
      "entry must be an object",
    ]);
  });

  it("rejects malformed text", () => {
    const noText: Record<string, unknown> = { ...phase };
    delete noText["text"];
    expect(msgs(validatePhaseFile("p.json", file([noText])))).toEqual([
      'missing field "text"',
    ]);
    expect(
      msgs(validatePhaseFile("p.json", file([{ ...phase, text: "x" }]))),
    ).toEqual(['field "text" must be an object']);
    const empty = { ...phase, text: { ...text, neutral: " " } };
    expect(msgs(validatePhaseFile("p.json", file([empty])))[0]).toContain(
      "non-empty string",
    );
  });

  it("rejects a malformed id", () => {
    const bad = { ...template, id: 3 };
    expect(msgs(validateHintTemplateFile("h.json", file([bad])))).toEqual([
      'field "id" must be a non-empty string',
    ]);
  });

  it("rejects malformed rule fields", () => {
    const base: Record<string, unknown> = { ...rule };
    const without = (key: string) =>
      Object.fromEntries(Object.entries(base).filter(([k]) => k !== key));
    const run = (entry: unknown) =>
      msgs(validateEngineRuleFile("r.json", file([entry])));
    expect(run(without("when"))).toEqual(['missing field "when"']);
    expect(run({ ...base, when: [] })).toEqual([
      'field "when" must be an object',
    ]);
    expect(run(without("categories"))).toEqual(['missing field "categories"']);
    expect(run({ ...base, categories: [] })).toEqual([
      'field "categories" must be a non-empty array',
    ]);
    expect(run(without("priority"))).toEqual(['missing field "priority"']);
    expect(run({ ...base, priority: "high" })).toEqual([
      'field "priority" must be a number',
    ]);
  });

  it("formats errors with file and entry", () => {
    expect(
      formatError({ file: "f.json", entry: "entries[0]", message: "m" }),
    ).toBe("f.json: entries[0]: m");
    expect(formatError({ file: "f.json", entry: "", message: "m" })).toBe(
      "f.json: m",
    );
  });
});

describe("loadLibrary", () => {
  const valid = {
    "content/phases.json": file([phase]),
    "content/hint-templates.json": file([template]),
    "content/engine-rules.json": file([rule]),
  };

  it("loads a valid library", () => {
    expect(loadLibrary(valid).ok).toBe(true);
  });

  it("reports missing and unknown files", () => {
    const rest: Record<string, unknown> = { ...valid };
    delete rest["content/phases.json"];
    const result = loadLibrary({ ...rest, "content/other.json": {} });
    const messages = errorsOf(result).map((e) => JSON.stringify(e));
    expect(messages.join()).toContain("unknown content file");
    expect(messages.join()).toContain("content file is missing");
  });

  it("passes validation errors with the file path", () => {
    const result = loadLibrary({
      ...valid,
      "content/engine-rules.json": { entries: [] },
    });
    expect(errorsOf(result)).toHaveProperty(
      "0.file",
      "content/engine-rules.json",
    );
  });
});
