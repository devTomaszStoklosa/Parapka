import { type Page } from "@playwright/test";

const REFUSED_STATUSES = [403, 410];

export type RelayRefusals = {
  /** Relay responses that refuse a pair request, as "status url". */
  refused: string[];
  /** Console warnings saying that the pair is gone. */
  warnings: string[];
};

/**
 * Collects, from now on, what tells that the page learned about a closed pair
 * from the relay's refusal instead of from the disconnect command.
 */
export function watchRelayRefusals(page: Page): RelayRefusals {
  const found: RelayRefusals = { refused: [], warnings: [] };
  page.on("response", (response) => {
    const url = response.url();
    if (
      url.includes("/v1/pairs/") &&
      REFUSED_STATUSES.includes(response.status())
    ) {
      found.refused.push(`${String(response.status())} ${url}`);
    }
  });
  page.on("console", (message) => {
    if (
      message.type() === "warning" &&
      /the pair is gone/i.test(message.text())
    ) {
      found.warnings.push(message.text());
    }
  });
  return found;
}
