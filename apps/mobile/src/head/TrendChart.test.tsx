// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TrendChart } from "./TrendChart";

afterEach(cleanup);

const week = (n: number) => `2026-W${String(n).padStart(2, "0")}`;

describe("the trend chart", () => {
  it("shows a bar per week with the number and a label", () => {
    render(
      <TrendChart
        partnerName="Ola"
        trend={[
          { week: week(45), split: null },
          { week: week(46), split: { me: 56, partner: 44 } },
        ]}
      />,
    );
    expect(screen.getByText("t. 46")).toBeTruthy();
    expect(screen.getByText("brak")).toBeTruthy();
    expect(screen.getByLabelText("Tydzień 46: Ty 56%, Ola 44%")).toBeTruthy();
    expect(screen.getByLabelText("Tydzień 45: brak rzeczy")).toBeTruthy();
    expect(screen.getAllByTestId("trend-bar")).toHaveLength(1);
  });

  it("calls the partner Partner without a name", () => {
    render(
      <TrendChart
        partnerName={null}
        trend={[{ week: week(3), split: { me: 10, partner: 90 } }]}
      />,
    );
    expect(
      screen.getByLabelText("Tydzień 3: Ty 10%, Partner 90%"),
    ).toBeTruthy();
  });

  it("shows nothing for an empty trend", () => {
    const { container } = render(<TrendChart trend={[]} partnerName={null} />);
    expect(container.textContent).toBe("");
  });

  it("shows the last 12 weeks at most", () => {
    const trend = Array.from({ length: 14 }, (_, i) => ({
      week: week(i + 1),
      split: { me: 50, partner: 50 },
    }));
    render(<TrendChart trend={trend} partnerName={null} />);
    expect(screen.getAllByTestId("trend-bar")).toHaveLength(12);
    expect(screen.queryByText("t. 2")).toBeNull();
    expect(screen.getByText("t. 3")).toBeTruthy();
  });
});
