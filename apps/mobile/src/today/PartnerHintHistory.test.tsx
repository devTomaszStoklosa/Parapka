// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { pl } from "../i18n/pl";
import { PartnerHintHistory } from "./PartnerHintHistory";
import type { PastHint } from "./use-partner-hint";

afterEach(cleanup);

const c = pl.todayHint;
const past = (
  id: string,
  forDate: string,
  reaction: PastHint["reaction"] = null,
): PastHint => ({
  hint: {
    id,
    forDate,
    text: `Tekst ${id}`,
    category: "space",
    status: "scheduled",
  },
  reaction,
});

it("renders nothing without entries", () => {
  const view = render(<PartnerHintHistory entries={[]} />);
  expect(view.container.innerHTML).toBe("");
});

it("is folded at first and opens with the button", () => {
  render(<PartnerHintHistory entries={[past("a", "2026-11-10")]} />);
  const button = screen.getByRole("button", { name: c.history });
  expect(button.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByText("Tekst a")).toBeNull();
  fireEvent.click(button);
  expect(button.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByText("Tekst a")).toBeTruthy();
});

it("shows the date, the order and the reaction of each entry", () => {
  render(
    <PartnerHintHistory
      entries={[
        past("a", "2026-11-10", "done"),
        past("b", "2026-11-09", "notToday"),
        past("c", "2026-11-08"),
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: c.history }));
  expect(screen.getByText("wt., 10 listopada")).toBeTruthy();
  expect(screen.getByText("pon., 9 listopada")).toBeTruthy();
  expect(screen.getByText("niedz., 8 listopada")).toBeTruthy();
  expect(screen.getAllByText(c.done)).toHaveLength(1);
  expect(screen.getAllByText(c.notToday)).toHaveLength(1);
  const text = document.body.textContent;
  expect(text.indexOf("Tekst a")).toBeLessThan(text.indexOf("Tekst b"));
});

it("shows the chip of the category of every opened entry", () => {
  render(<PartnerHintHistory entries={[past("a", "2026-11-10")]} />);
  fireEvent.click(screen.getByRole("button", { name: c.history }));
  expect(screen.getByText(c.categories.space)).toBeTruthy();
});
