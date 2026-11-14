// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { CheckinAnswers } from "@parapka/domain";
import { afterEach, expect, it } from "vitest";

import { pl } from "../i18n/pl";
import { CheckinResults } from "./CheckinResults";

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

afterEach(cleanup);

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

it("is neutral: same style for any value and person, no other numbers", () => {
  const styleOf = (own: Score, partner: Score) => {
    const { container, unmount } = render(
      <CheckinResults
        own={a(own, own, own)}
        partner={a(partner, partner, partner)}
        partnerName="Ola"
      />,
    );
    const styles = [...container.querySelectorAll("div")].map((node) =>
      node.getAttribute("style"),
    );
    const text = [...container.querySelectorAll("div")]
      .filter((node) => node.children.length === 0)
      .map((node) => node.textContent)
      .join("|");
    unmount();
    return { styles, text };
  };
  const low = styleOf(1, 5);
  const high = styleOf(5, 1);
  expect(low.styles).toEqual(high.styles);
  const numbers = (text: string) =>
    text.replaceAll(" z 5", "").match(/\d+/g)?.sort();
  expect(numbers(low.text)).toEqual(["1", "1", "1", "5", "5", "5"]);
  expect(low.text.replaceAll(/\d+ z 5/g, "")).not.toMatch(/\d|%/);
});
