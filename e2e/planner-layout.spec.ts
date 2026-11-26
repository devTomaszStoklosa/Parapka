import { expect, test, type Locator, type Page } from "@playwright/test";

import { addChore, newUser } from "./support/app";
import { fitsWidth, titleLeavesChip } from "./support/layout";

/** Whether the element is the one at the center of its own box. */
const onTop = (element: Locator) =>
  element.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const found = document.elementFromPoint(
      box.x + box.width / 2,
      box.y + box.height / 2,
    );
    return found !== null && node.contains(found);
  });

const bottom = async (element: Locator) => {
  const box = await element.boundingBox();
  return (box?.y ?? 0) + (box?.height ?? 0);
};

const top = async (element: Locator) => (await element.boundingBox())?.y ?? 0;

async function deleteLast(page: Page) {
  for (const title of ["Pierwszy", "Drugi", "Trzeci", "Czwarty"]) {
    await addChore(page, title);
  }
  await page.getByRole("radio", { name: "Wszystkie" }).click();
  await page
    .getByRole("button", { name: /^Czwarty, / })
    .first()
    .click();
  await page.getByRole("button", { name: "Usuń", exact: true }).click();
}

for (const width of [320, 390]) {
  test(`the Undo bar and the add button stay usable at ${width.toString()} px`, async ({
    browser,
  }) => {
    const a = await newUser(browser, "Anna", "feminine");
    try {
      const page = a.page;
      await page.setViewportSize({ width, height: 640 });
      await deleteLast(page);

      const undo = page.getByRole("button", { name: "Cofnij", exact: true });
      await expect(undo).toBeVisible();
      expect(await onTop(undo)).toBe(true);

      const add = page.getByRole("button", { name: "Dodaj obowiązek" });
      const tabs = page.getByRole("tablist");
      expect(await bottom(undo)).toBeLessThanOrEqual(await top(add));
      expect(await bottom(add)).toBeLessThanOrEqual(await top(tabs));

      await page.getByTestId("planner-scroll").evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      const last = page.getByRole("button", { name: /^Trzeci, / }).last();
      expect(await bottom(last)).toBeLessThanOrEqual(await top(undo));
    } finally {
      await a.context.close();
    }
  });
}

const LONG =
  "Odkurzyć salon i przedpokój przed weekendem, a potem umyć podłogę w kuchni";

test("the planner rows fit 320 px and a long title wraps beside the chip", async ({
  browser,
}) => {
  const a = await newUser(browser, "Anna", "feminine");
  try {
    const page = a.page;
    await page.setViewportSize({ width: 320, height: 640 });
    await addChore(page, "Pierwszy");
    await addChore(page, LONG);
    await addChore(page, "Trzeci");

    expect(await fitsWidth(page)).toBe(true);
    expect(await titleLeavesChip(page.getByText(LONG, { exact: true }))).toBe(
      true,
    );
  } finally {
    await a.context.close();
  }
});
