import { expect, it } from "vitest";

import { t } from "./index";

it("returns a plain entry", () => {
  expect(t("tabs.today")).toBe("Dziś");
});

it("interpolates parameters and keeps unknown placeholders", () => {
  expect(t("screens.depth", { level: 2 })).toBe("Poziom stosu: 2");
  expect(t("screens.depth")).toBe("Poziom stosu: {level}");
});

it("picks the feminine form", () => {
  expect(t("greeting.ready", { name: "Ala" }, "feminine")).toBe(
    "Ala, jesteś gotowa.",
  );
});

it("picks the masculine form", () => {
  expect(t("greeting.ready", { name: "Olek" }, "masculine")).toBe(
    "Olek, jesteś gotowy.",
  );
});

it("picks the neutral form, also by default", () => {
  const text = "Sam, masz już wszystko gotowe.";
  expect(t("greeting.ready", { name: "Sam" }, "neutral")).toBe(text);
  expect(t("greeting.ready", { name: "Sam" })).toBe(text);
});

it("rejects a missing key at compile time", () => {
  // @ts-expect-error the key does not exist in the dictionary
  expect(() => t("tabs.missing")).toThrow();
});
