// @vitest-environment jsdom
import { HINT_DAYS_AHEAD } from "@parapka/domain";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { pl } from "../i18n/pl";
import { HomeScreen } from "./HomeScreen";

it("renders the texts from the translation file", () => {
  render(<HomeScreen />);
  expect(screen.getByText(pl.home.title)).toBeTruthy();
  expect(screen.getByText(pl.home.subtitle)).toBeTruthy();
  expect(
    screen.getByText(pl.home.hintWindow + " " + String(HINT_DAYS_AHEAD)),
  ).toBeTruthy();
});
