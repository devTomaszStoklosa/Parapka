// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import {
  setupCheckin,
  showToday,
  useSodium,
} from "../checkin/checkin-test-screen-support";
import { pl } from "../i18n/pl";

useSodium();
afterEach(cleanup);

it("shows the title and the check-in card", async () => {
  const { platform } = await setupCheckin(true);
  showToday(platform);
  expect(screen.getByRole("heading").textContent).toBe(pl.screens.today.title);
  expect(await screen.findByText(pl.checkin.form.save)).toBeTruthy();
});
