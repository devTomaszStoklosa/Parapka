import { expect, test } from "@playwright/test";

import { addChore, newUser, openTab, pair, type User } from "./support/app";

const SHARED = "Podlać kwiaty";
const LATER = "Wynieść śmieci";

/** A leaves the pair from Settings, confirming the dialog. */
async function disconnect(user: User) {
  await openTab(user.page, "Ustawienia");
  await user.page.getByRole("button", { name: "Rozłącz" }).first().click();
  await user.page.getByRole("button", { name: "Rozłącz" }).last().click();
  await expect(user.page.getByText(/Jesteście w parze/)).toHaveCount(0);
  await expect(
    user.page.getByRole("button", { name: "Zaproś partnera" }),
  ).toBeVisible();
}

test("disconnecting while the partner is offline reaches them later", async ({
  browser,
}) => {
  const a = await newUser(browser, "Anna", "feminine");
  const b = await newUser(browser, "Bartek", "masculine");
  try {
    await pair(a, b);
    await addChore(a.page, SHARED);
    await openTab(b.page, "Planer");
    await expect(b.page.getByText(SHARED)).toBeVisible({ timeout: 30_000 });

    await b.context.setOffline(true);
    await disconnect(a);
    await openTab(a.page, "Planer");
    await expect(a.page.getByText(SHARED)).toBeVisible();

    await b.context.setOffline(false);
    await b.page.reload();
    await openTab(b.page, "Ustawienia");
    await expect(b.page.getByText("Para została rozłączona")).toBeVisible({
      timeout: 30_000,
    });
    await openTab(b.page, "Planer");
    await expect(b.page.getByText(SHARED)).toBeVisible();

    await addChore(a.page, LATER);
    await openTab(b.page, "Ustawienia");
    await openTab(b.page, "Planer");
    await expect(b.page.getByText(LATER)).toHaveCount(0);

    await openTab(a.page, "Ustawienia");
    await a.page
      .getByRole("button", { name: "Usuń wszystkie moje dane" })
      .click();
    await a.page.getByRole("button", { name: "Dalej", exact: true }).click();
    await a.page
      .getByRole("button", { name: "Tak, usuń wszystko", exact: true })
      .click();
    await expect(a.page.getByLabel("Imię", { exact: true })).toBeVisible();
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
