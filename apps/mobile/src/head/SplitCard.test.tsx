// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { pl } from "../i18n/pl";
import { colors } from "../ui/theme";
import { SplitCard } from "./SplitCard";

afterEach(cleanup);

const WORDS = /nierówno|za dużo|za mało|więcej niż|mniej niż|sprawiedliw|winn/i;
const texts = (node: object): string[] =>
  Object.values(node).flatMap((v: unknown) =>
    typeof v === "string" ? [v] : texts(v as object),
  );

/** The color as the DOM normalizes it, to compare notations. */
function normalized(color: string): string {
  const probe = document.createElement("div");
  probe.style.color = color;
  return probe.style.color;
}

describe("the split card", () => {
  it("shows the shares and a bar as wide as they are", () => {
    render(<SplitCard split={{ me: 56, partner: 44 }} partnerName="Ola" />);
    expect(screen.getByText(pl.head.split.title)).toBeTruthy();
    expect(screen.getByText("Ty 56%")).toBeTruthy();
    expect(screen.getByText("Ola 44%")).toBeTruthy();
    expect(screen.getByText(pl.head.split.basis)).toBeTruthy();
    expect(screen.getByTestId("split-me").style.width).toBe("56%");
    expect(screen.getByTestId("split-partner").style.width).toBe("44%");
  });

  it("calls the partner Partner without a name", () => {
    render(<SplitCard split={{ me: 56, partner: 44 }} partnerName={null} />);
    expect(screen.getByText("Partner 44%")).toBeTruthy();
  });

  it("shows a neutral text instead of the shares when there is no split", () => {
    render(<SplitCard split={null} partnerName={null} />);
    expect(screen.getByText(pl.head.split.empty)).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("uses no judging words and only the colors of the theme", () => {
    for (const text of [...texts(pl.head.split), ...texts(pl.head.trend)]) {
      expect(text).not.toMatch(WORDS);
    }
    render(<SplitCard split={{ me: 50, partner: 50 }} partnerName={null} />);
    const known = Object.values(colors).map(normalized);
    for (const id of ["split-me", "split-partner"]) {
      const background = screen.getByTestId(id).style.backgroundColor;
      expect(known).toContain(normalized(background));
    }
  });
});
