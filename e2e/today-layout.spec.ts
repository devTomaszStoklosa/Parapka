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

test("the check-in form fits 320 px with every scale in one row", async ({
  browser,
}) => {
  const a = await newUser(browser, "Anna", "feminine");
  const b = await newUser(browser, "Bartek", "masculine");
  try {
    await pair(a, b);
    const page = a.page;
    await page.setViewportSize({ width: 320, height: 480 });
    await page.getByRole("tab", { name: "Dziś", exact: true }).click();
    const group = page.getByRole("radiogroup", { name: "Nastrój" });
    await group.scrollIntoViewIfNeeded();

    const fits = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    );
    expect(fits).toBe(true);

    for (const name of ["Nastrój", "Energia", "Bliskość"]) {
      const radios = page.getByRole("radiogroup", { name }).getByRole("radio");
      expect(await radios.count()).toBe(5);
      const tops = new Set<number>();
      for (let index = 0; index < 5; index += 1) {
        const box = await radios.nth(index).boundingBox();
        expect(box).not.toBeNull();
        tops.add(Math.round(box?.y ?? 0));
      }
      expect(tops.size).toBe(1);
    }
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
