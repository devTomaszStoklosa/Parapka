import { expect, test } from "@playwright/test";

import { newUser, pair } from "./support/app";

test("the Today screen fits 320 px and scrolls the pause above the tab bar", async ({
  browser,
}) => {
  const a = await newUser(browser, "Anna", "feminine");
  const b = await newUser(browser, "Bartek", "masculine");
  try {
    await pair(a, b);
    const page = a.page;
    await page.setViewportSize({ width: 320, height: 480 });
    await page.getByRole("tab", { name: "Dziś", exact: true }).click();

    const fits = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    );
    expect(fits).toBe(true);

    const pause = page.getByRole("switch", { name: "Pauza", exact: true });
    await pause.scrollIntoViewIfNeeded();
    const tabs = await page.getByRole("tablist").boundingBox();
    const row = await page.getByText(/^Wstrzymuje wysyłanie/).boundingBox();
    expect(tabs).not.toBeNull();
    expect(row).not.toBeNull();
    expect((row?.y ?? 0) + (row?.height ?? 0)).toBeLessThanOrEqual(
      tabs?.y ?? 0,
    );
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
