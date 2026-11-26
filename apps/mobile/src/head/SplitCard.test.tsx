// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { pl } from "../i18n/pl";
import { colors, contrastRatio } from "../ui/theme";
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

const TONES = { own: "personA", partner: "personB" } as const;
const SWAPPED = { own: "personB", partner: "personA" } as const;
const LENGTH = 2 * Math.PI * 40;

/** The visible length of an arc, as a share of the whole ring. */
const share = (id: string) =>
  (Number(
    screen.getByTestId(id).getAttribute("stroke-dasharray")?.split(" ")[0],
  ) /
    LENGTH) *
  100;

describe("the split card", () => {
  it("shows the shares and a bar as wide as they are", () => {
    render(
      <SplitCard
        split={{ me: 56, partner: 44 }}
        partnerName="Ola"
        tones={TONES}
      />,
    );
    expect(screen.getByText(pl.head.split.title)).toBeTruthy();
    expect(screen.getByText("Ty 56%")).toBeTruthy();
    expect(screen.getByText("Ola 44%")).toBeTruthy();
    expect(screen.getByText(pl.head.split.basis)).toBeTruthy();
    expect(share("split-me")).toBeCloseTo(56);
    expect(share("split-partner")).toBeCloseTo(44);
  });

  it("names the ring with the shares of both people", () => {
    render(
      <SplitCard
        split={{ me: 56, partner: 44 }}
        partnerName="Jan"
        tones={TONES}
      />,
    );
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Ty 56%, Jan 44%",
    );
  });

  it("colors the arcs with the tones of the people", () => {
    render(
      <SplitCard
        split={{ me: 56, partner: 44 }}
        partnerName="Jan"
        tones={SWAPPED}
      />,
    );
    expect(screen.getByTestId("split-me").getAttribute("stroke")).toBe(
      colors.personB,
    );
    expect(screen.getByTestId("split-partner").getAttribute("stroke")).toBe(
      colors.personA,
    );
  });

  it("draws one full arc and no empty one at 100% and 0%", () => {
    render(
      <SplitCard
        split={{ me: 100, partner: 0 }}
        partnerName="Jan"
        tones={TONES}
      />,
    );
    expect(share("split-me")).toBeCloseTo(100);
    expect(screen.queryByTestId("split-partner")).toBeNull();
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Ty 100%, Jan 0%",
    );
  });

  it("draws no arc of me at 0%", () => {
    render(
      <SplitCard
        split={{ me: 0, partner: 100 }}
        partnerName="Jan"
        tones={TONES}
      />,
    );
    expect(screen.queryByTestId("split-me")).toBeNull();
    expect(share("split-partner")).toBeCloseTo(100);
  });

  it("shows the number of open shared things in the middle when known", () => {
    render(
      <SplitCard
        split={{ me: 56, partner: 44 }}
        partnerName="Jan"
        tones={TONES}
        openCount={7}
      />,
    );
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("keeps the middle empty without the number", () => {
    render(
      <SplitCard
        split={{ me: 56, partner: 44 }}
        partnerName="Jan"
        tones={TONES}
      />,
    );
    expect(screen.getByRole("img").textContent).toBe("");
  });

  it("keeps the arcs of both people at least 3:1 against the card", () => {
    for (const color of [colors.personA, colors.personB]) {
      expect(contrastRatio(color, colors.surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it("calls the partner Partner without a name", () => {
    render(
      <SplitCard
        split={{ me: 56, partner: 44 }}
        partnerName={null}
        tones={TONES}
      />,
    );
    expect(screen.getByText("Partner 44%")).toBeTruthy();
  });

  it("shows a neutral text instead of the shares when there is no split", () => {
    render(<SplitCard split={null} partnerName={null} tones={TONES} />);
    expect(screen.getByText(pl.head.split.empty)).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("uses no judging words and only the colors of the theme", () => {
    for (const text of [...texts(pl.head.split), ...texts(pl.head.trend)]) {
      expect(text).not.toMatch(WORDS);
    }
    render(
      <SplitCard
        split={{ me: 50, partner: 50 }}
        partnerName={null}
        tones={TONES}
      />,
    );
    const known = Object.values(colors).map(normalized);
    for (const id of ["split-me", "split-partner"]) {
      const stroke = screen.getByTestId(id).getAttribute("stroke") ?? "";
      expect(known).toContain(normalized(stroke));
    }
  });
});
