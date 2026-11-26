// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { CheckinAnswers } from "@parapka/domain";
import { afterEach, expect, it, vi } from "vitest";

import { pl } from "../i18n/pl";
import type { PersonTones } from "../pairing/person-tone";
import { colors, contrastRatio } from "../ui/theme";
import { CheckinResults } from "./CheckinResults";

const mocks = vi.hoisted(() => {
  const tones: PersonTones = { own: "personA", partner: "personB" };
  return { tones };
});
vi.mock("../platform/context", () => ({ usePlatform: () => ({}) }));
vi.mock("../pairing/use-person-tones", () => ({
  usePersonTones: () => mocks.tones,
}));

const r = pl.checkin.results;
type Score = CheckinAnswers["mood"];
const a = (
  mood: Score,
  energy: Score,
  closeness: Score,
  need?: string,
): CheckinAnswers => ({
  mood,
  energy,
  closeness,
  ...(need === undefined ? {} : { need }),
});

afterEach(() => {
  cleanup();
  mocks.tones = { own: "personA", partner: "personB" };
});

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${String((n >> 16) & 255)}, ${String((n >> 8) & 255)}, ${String(n & 255)})`;
};

/** The dots of the first row, per column: the border color of each of the five. */
const dotColors = (container: HTMLElement) =>
  [...container.querySelectorAll('[aria-hidden="true"]')].map((group) =>
    [...group.children].map((dot) => dot.getAttribute("style") ?? ""),
  );

it("shows both answers side by side with the name of the partner", () => {
  render(
    <CheckinResults
      own={a(4, 3, 5, "ciszy")}
      partner={a(2, 1, 3)}
      partnerName="Ola"
    />,
  );
  expect(screen.getByText(r.title)).toBeTruthy();
  expect(screen.getByText("Ola")).toBeTruthy();
  expect(
    screen.getByLabelText(`${pl.checkin.form.mood} — Ty: 4 z 5, Ola: 2 z 5`)
      .textContent,
  ).toBe("4 z 52 z 5");
  expect(
    screen.getByLabelText(`${r.closeness} — Ty: 5 z 5, Ola: 3 z 5`),
  ).toBeTruthy();
  expect(screen.getByText("ciszy")).toBeTruthy();
  expect(screen.getByText(r.none)).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByRole("radio")).toBeNull();
});

it("keeps You on the left and falls back to Partner without a name", () => {
  render(
    <CheckinResults own={a(4, 3, 5)} partner={a(2, 1, 3)} partnerName={null} />,
  );
  const header = screen.getByText(r.you).parentElement;
  expect(header?.textContent).toBe(`${r.you}${r.partner}`);
  expect(header?.firstElementChild?.textContent).toBe(r.you);
});

it("shows a dash for answers that are missing", () => {
  render(<CheckinResults own={null} partner={null} partnerName="Ola" />);
  expect(screen.getAllByText(r.none)).toHaveLength(8);
});

it("has no sums or differences of the answers", () => {
  const { container } = render(
    <CheckinResults own={a(4, 3, 5)} partner={a(2, 1, 3)} partnerName="Ola" />,
  );
  const labels = [...container.querySelectorAll("[aria-label]")].map((node) =>
    node.getAttribute("aria-label"),
  );
  const all = `${container.textContent}|${labels.join("|")}`;
  expect(all).not.toMatch(/[+−]\d|razem|suma|różnic/i);
});

it("colors by person only: values 1 and 5 of one person share a color", () => {
  const { container } = render(
    <CheckinResults own={a(1, 5, 1)} partner={a(5, 1, 5)} partnerName="Ola" />,
  );
  const groups = dotColors(container);
  const [first, second] = [groups[0], groups[2]];
  const filled = (dots: string[] | undefined, count: number) =>
    dots
      ?.slice(0, count)
      .map((style) => style.match(/background-color: [^;]+/)?.[0]);
  const ownLow = filled(first, 1);
  const ownHigh = filled(second, 5);
  expect(ownLow?.[0]).toBe(`background-color: ${rgb(colors.personA)}`);
  expect(new Set([...(ownLow ?? []), ...(ownHigh ?? [])]).size).toBe(1);
  expect(colors.personA).not.toBe(colors.personB);
  expect(dotColors(container)[0]?.[4]).toContain(rgb(colors.border));
});

it("hides the dots from readers and keeps the text alternative", () => {
  const { container } = render(
    <CheckinResults own={a(4, 3, 5)} partner={null} partnerName="Ola" />,
  );
  expect(
    screen.getByLabelText(`${pl.checkin.form.mood} — Ty: 4 z 5, Ola: —`),
  ).toBeTruthy();
  const hidden = container.querySelectorAll('[aria-hidden="true"]');
  expect(hidden).toHaveLength(6);
  for (const group of hidden) expect(group.children).toHaveLength(5);
});

it("takes the colors of the columns from the tones of the people", () => {
  mocks.tones = { own: "personB", partner: "personA" };
  const { container } = render(
    <CheckinResults own={a(5, 5, 5)} partner={a(5, 5, 5)} partnerName="Ola" />,
  );
  const [own, partner] = dotColors(container);
  expect(own?.[0]).toContain(rgb(colors.personB));
  expect(partner?.[0]).toContain(rgb(colors.personA));
});

it("has enough contrast for the dots of both people and the empty ones", () => {
  for (const color of [colors.personA, colors.personB, colors.border]) {
    expect(contrastRatio(color, colors.surface)).toBeGreaterThanOrEqual(3);
  }
});
