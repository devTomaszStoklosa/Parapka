import { expect, test } from "@playwright/test";

import { newUser, openTab, pair } from "./support/app";

test("two people pair through the relay and share a chore", async ({
  browser,
}) => {
  const a = await newUser(browser, "Anna", "feminine");
  const b = await newUser(browser, "Bartek", "masculine");
  try {
    await pair(a, b);

    await openTab(a.page, "Planer");
    await a.page
      .getByRole("button", { name: "Dodaj pierwszy obowiązek" })
      .click();
    await a.page.getByLabel("Tytuł", { exact: true }).fill("Wynieść śmieci");
    await a.page.getByRole("button", { name: "Zapisz", exact: true }).click();
    await expect(a.page.getByText("Wynieść śmieci")).toBeVisible();

    await openTab(b.page, "Planer");
    await expect(b.page.getByText("Wynieść śmieci")).toBeVisible();
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
