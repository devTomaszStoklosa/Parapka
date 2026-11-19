import { expect, test } from "@playwright/test";

import { addChore, newUser, openTab, pair, type User } from "./support/app";
import {
  enableCheckinConsent,
  fillCheckin,
  openCheckin,
  setSundayEvening,
} from "./support/checkin";
import { watchRelayRefusals } from "./support/relay";

const SHARED = "Podlać kwiaty";
const LATER = "Wynieść śmieci";
const NEED_A = "Potrzebuję spokojnego wieczoru";
const NEED_B = "Potrzebuję wspólnego spaceru";

/** Both people share a check-in, so that B holds the data of A. */
async function shareCheckin(a: User, b: User) {
  for (const user of [a, b]) {
    await enableCheckinConsent(user.page);
    await setSundayEvening(user.page);
    await user.page.reload();
    await openCheckin(user);
  }
  await fillCheckin(a.page, { mood: 4, energy: 3, closeness: 5, need: NEED_A });
  await fillCheckin(b.page, { mood: 2, energy: 4, closeness: 3, need: NEED_B });
  await expect(b.page.getByText(NEED_A)).toBeVisible({ timeout: 30_000 });
}

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
    const relay = watchRelayRefusals(b.page);
    await pair(a, b);
    await shareCheckin(a, b);
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
    // B learned it from the command, not from the relay refusing the pair.
    expect(relay.refused).toEqual([]);
    expect(relay.warnings).toEqual([]);

    await b.page.reload();
    // SHARED visible is the sign that local data has loaded.
    await openTab(b.page, "Planer");
    await expect(b.page.getByText(SHARED)).toBeVisible();
    await openTab(b.page, "Dziś");
    // The UI hides check-in results without a pair, so this alone does not
    // prove the data is gone; the missing relay refusal above proves that the
    // command arrived. The no-pair text is the sign that the card has loaded.
    await expect(
      b.page.getByText("Check-in działa, gdy połączycie się w parę."),
    ).toBeVisible();
    await expect(b.page.getByText(NEED_A)).toHaveCount(0);

    await addChore(a.page, LATER);
    await b.page.reload();
    await expect(b.page.getByText(SHARED)).toBeVisible();
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
