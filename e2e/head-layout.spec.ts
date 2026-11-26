import { expect, test } from "@playwright/test";

import type { Locator } from "@playwright/test";

import { newUser, openTab, pair } from "./support/app";
import { fitsWidth } from "./support/layout";

/** Whether the box of `inner` lies within the box of its card. */
async function insideCard(inner: Locator): Promise<boolean> {
  const card = inner.locator("xpath=ancestor::*[1]/..");
  const box = await inner.boundingBox();
  const outer = await card.boundingBox();
  if (box === null || outer === null) return false;
  return box.x >= outer.x && box.x + box.width <= outer.x + outer.width;
}

test("the Head screen fits 320 px and the split chart stays in its card", async ({
  browser,
}) => {
  const a = await newUser(browser, "Anna", "feminine");
  const b = await newUser(browser, "Bartek", "masculine");
  try {
    await pair(a, b);
    const page = a.page;
    await page.setViewportSize({ width: 320, height: 640 });
    await openTab(page, "Głowa");
    await page.getByLabel("Co masz w głowie?").fill("Wspólna rzecz");
    await page.getByRole("button", { name: "Dodaj", exact: true }).click();
    await expect(page.getByText("Wspólna rzecz")).toBeVisible();

    const chart = page.getByRole("img", { name: /^Ty \d+%, / });
    await chart.scrollIntoViewIfNeeded();
    expect(await fitsWidth(page)).toBe(true);

    expect(await insideCard(chart)).toBe(true);
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
