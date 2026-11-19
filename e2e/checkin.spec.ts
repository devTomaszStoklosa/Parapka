import { expect, test } from "@playwright/test";

import { newUser, pair } from "./support/app";
import {
  enableCheckinConsent,
  fillCheckin,
  openCheckin,
  setSundayEvening,
} from "./support/checkin";

const NEED_A = "Potrzebuję spokojnego wieczoru";
const NEED_B = "Potrzebuję wspólnego spaceru";

test("check-in results stay hidden until both people fill it in", async ({
  browser,
}) => {
  const a = await newUser(browser, "Anna", "feminine");
  const b = await newUser(browser, "Bartek", "masculine");
  try {
    await pair(a, b);
    for (const user of [a, b]) {
      await enableCheckinConsent(user.page);
      await setSundayEvening(user.page);
      await user.page.reload();
    }

    await openCheckin(a);
    await openCheckin(b);
    await fillCheckin(a.page, {
      mood: 4,
      energy: 3,
      closeness: 5,
      need: NEED_A,
    });
    await expect(a.page.getByText("Czekamy na wyniki")).toBeVisible();

    await expect(b.page.getByText(NEED_A)).toHaveCount(0);
    await expect(b.page.getByText("Czekamy na wyniki")).toHaveCount(0);

    await fillCheckin(b.page, {
      mood: 2,
      energy: 4,
      closeness: 3,
      need: NEED_B,
    });
    for (const user of [a, b]) {
      await expect(
        user.page.getByText("Wasz check-in z tego tygodnia"),
      ).toBeVisible({ timeout: 30_000 });
      await expect(user.page.getByText(NEED_A)).toBeVisible();
      await expect(user.page.getByText(NEED_B)).toBeVisible();
    }
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
