// @vitest-environment jsdom
import type { PhaseDescription } from "@parapka/content";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { pl } from "../i18n/pl";
import { PhaseCard } from "./PhaseCard";

afterEach(cleanup);

const description = (review: PhaseDescription["review"]): PhaseDescription => ({
  phase: "follicular",
  text: { feminine: "Ona.", masculine: "On.", neutral: "Ono." },
  review,
});

it("shows the phase as an estimate with the text of the form", () => {
  render(
    <PhaseCard
      phase="follicular"
      description={description("reviewed")}
      form="masculine"
    />,
  );
  expect(screen.getByText(pl.cycle.today)).toBeTruthy();
  expect(screen.getByText("Faza folikularna (szacunek)")).toBeTruthy();
  expect(screen.getByText("On.")).toBeTruthy();
  expect(screen.queryByText(pl.cycle.draft)).toBeNull();
});

it("marks the text that nobody has reviewed", () => {
  render(
    <PhaseCard
      phase="luteal"
      description={description("unreviewed")}
      form="feminine"
    />,
  );
  expect(screen.getByText("Faza lutealna (szacunek)")).toBeTruthy();
  expect(screen.getByText("Ona.")).toBeTruthy();
  expect(screen.getByText(pl.cycle.draft)).toBeTruthy();
});

it("shows only the name when the library has no text", () => {
  render(
    <PhaseCard phase="menstruation" description={undefined} form="neutral" />,
  );
  expect(screen.getByText("Faza miesiączki (szacunek)")).toBeTruthy();
  expect(screen.queryByText(pl.cycle.draft)).toBeNull();
});
