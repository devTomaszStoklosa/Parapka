import { expect, type Page } from "@playwright/test";

import { openTab, type User } from "./app";

const CONSENT = /Wspólne sprawdzenie samopoczucia/;

/** The nearest Sunday 19:05, the default check-in window (today when it is Sunday). */
export function sundayEvening(now = new Date()): Date {
  const days = (7 - now.getDay()) % 7;
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + days,
    19,
    5,
  );
}

/**
 * Fixes the date of the page without freezing timers, so that sync keeps
 * running. Call it after pairing: the relay uses the real time, and an
 * invitation would expire at once under a date in the future.
 */
export async function setSundayEvening(page: Page) {
  await page.clock.setFixedTime(sundayEvening());
}

/** The shared check-in is off by default; each person turns it on in Settings. */
export async function enableCheckinConsent(page: Page) {
  await openTab(page, "Ustawienia");
  const consent = page.getByRole("checkbox", { name: CONSENT });
  await consent.click();
  await expect(consent).toBeChecked();
}

/** Opens the check-in form on the "Dziś" tab. */
export async function openCheckin(user: User) {
  await openTab(user.page, "Dziś");
  await expect(user.page.getByRole("button", { name: "Zapisz" })).toBeVisible();
}

/** Fills and saves the check-in form of the "Dziś" tab. */
export async function fillCheckin(
  page: Page,
  answers: { mood: number; energy: number; closeness: number; need: string },
) {
  await page
    .getByRole("radio", { name: `Nastrój: ${String(answers.mood)} z 5` })
    .click();
  await page
    .getByRole("radio", { name: `Energia: ${String(answers.energy)} z 5` })
    .click();
  await page
    .getByRole("radio", {
      name: new RegExp(`^Jak blisko.*: ${String(answers.closeness)} z 5`),
    })
    .click();
  await page.getByRole("textbox").fill(answers.need);
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
}
