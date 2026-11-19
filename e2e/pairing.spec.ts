import { expect, test } from "@playwright/test";

import { addChore, newUser, openTab, pair } from "./support/app";

test("two people pair through the relay and share a chore", async ({
  browser,
}) => {
  const a = await newUser(browser, "Anna", "feminine");
  const b = await newUser(browser, "Bartek", "masculine");
  try {
    await pair(a, b);

    await addChore(a.page, "Wynieść śmieci");

    await openTab(b.page, "Planer");
    await expect(b.page.getByText("Wynieść śmieci")).toBeVisible();
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
