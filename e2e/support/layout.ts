import type { Locator, Page } from "@playwright/test";

/** Whether the page has no horizontal scroll. */
export const fitsWidth = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  );

/**
 * Whether the right edge of the title is at or before the left edge of the
 * "Ty" chip in the same row, so a wrapping title never covers the chip.
 */
export async function titleLeavesChip(title: Locator): Promise<boolean> {
  const chip = title
    .locator("xpath=ancestor::*[@role='button'][1]/..")
    .getByText("Ty", { exact: true });
  const titleBox = await title.boundingBox();
  const chipBox = await chip.boundingBox();
  if (titleBox === null || chipBox === null) return false;
  return titleBox.x + titleBox.width <= chipBox.x;
}
