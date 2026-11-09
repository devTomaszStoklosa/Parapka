// @vitest-environment jsdom
import { HINT_DAYS_AHEAD } from "@parapka/domain";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { App } from "../App";
import { pl } from "../i18n/pl";
import { HomeScreen } from "./HomeScreen";

afterEach(cleanup);

it("renders the texts from the translation file", () => {
  render(<HomeScreen />);
  expect(screen.getByText(pl.home.title)).toBeTruthy();
  expect(screen.getByText(pl.home.subtitle)).toBeTruthy();
  expect(
    screen.getByText(pl.home.hintWindow + " " + String(HINT_DAYS_AHEAD)),
  ).toBeTruthy();
});

it("renders the home screen as the root component", () => {
  render(<App />);
  expect(screen.getByText(pl.home.title)).toBeTruthy();
});
