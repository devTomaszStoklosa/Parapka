// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { HintDays, HintHistory } from "./HintHistory";

afterEach(cleanup);

const entries = [
  { key: "a", label: "Dzień A", text: "Tekst A" },
  { key: "b", label: "Dzień B", text: "Tekst B" },
];

it("lists the days under the title and shows nothing without any", () => {
  const view = render(<HintDays title="Kolejne" entries={entries} />);
  expect(screen.getByRole("heading").textContent).toBe("Kolejne");
  expect(screen.getByText("Dzień B")).toBeTruthy();
  expect(screen.getByText("Tekst B")).toBeTruthy();
  view.rerender(<HintDays title="Kolejne" entries={[]} />);
  expect(view.container.innerHTML).toBe("");
});

it("folds the history at first and opens it with the button", () => {
  render(<HintHistory title="Historia" empty="Pusto" entries={entries} />);
  const button = screen.getByRole("button", { name: "Historia" });
  expect(button.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByText("Tekst A")).toBeNull();
  fireEvent.click(button);
  expect(button.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByText("Tekst A")).toBeTruthy();
  fireEvent.click(button);
  expect(screen.queryByText("Tekst A")).toBeNull();
});

it("says so when the opened history is empty", () => {
  render(<HintHistory title="Historia" empty="Pusto" entries={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Historia" }));
  expect(screen.getByText("Pusto")).toBeTruthy();
});

it("shows the chip of the category only for an entry that has one", () => {
  render(
    <HintDays
      title="Kolejne"
      entries={[
        { key: "c", label: "Dzień C", text: "Tekst C", category: "relief" },
        ...entries,
      ]}
    />,
  );
  expect(screen.getAllByText("Odciążenie")).toHaveLength(1);
});
