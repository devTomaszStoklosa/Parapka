import { expect, type Page } from "@playwright/test";

import { openTab } from "./app";

export interface ChoreFields {
  readonly title?: string;
  readonly note?: string;
}

/** Touching the row of a chore in the Planner opens "Edycja obowiązku". */
async function openChore(page: Page, title: string) {
  await openTab(page, "Planer");
  await page
    .getByRole("button", { name: new RegExp(`^${title}, `) })
    .first()
    .click();
}

/** Changes the given fields of a chore and saves it. */
export async function editChore(
  page: Page,
  title: string,
  fields: ChoreFields,
) {
  await openChore(page, title);
  if (fields.title !== undefined) {
    await page.getByLabel("Tytuł", { exact: true }).fill(fields.title);
  }
  if (fields.note !== undefined) {
    await page
      .getByLabel("Notatka (opcjonalna)", { exact: true })
      .fill(fields.note);
  }
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
}

/** The chore shows under the new title, and its editor holds both fields. */
export async function expectChore(
  page: Page,
  oldTitle: string,
  fields: Required<ChoreFields>,
) {
  await openTab(page, "Planer");
  await expect(page.getByText(fields.title).first()).toBeVisible({
    timeout: 30_000,
  });
  if (oldTitle !== fields.title) {
    await expect(page.getByText(oldTitle, { exact: true })).toHaveCount(0);
  }
  await openChore(page, fields.title);
  await expect(page.getByLabel("Tytuł", { exact: true })).toHaveValue(
    fields.title,
  );
  await expect(
    page.getByLabel("Notatka (opcjonalna)", { exact: true }),
  ).toHaveValue(fields.note);
}
