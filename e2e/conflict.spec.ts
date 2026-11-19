import { expect, test, type Browser } from "@playwright/test";

import { addChore, newUser, openTab, pair, type User } from "./support/app";
import { editChore, expectChore } from "./support/chores";

const TITLE = "Podlać kwiaty";

/** Two paired people who both have the shared chore; B's clock runs later. */
async function pairedWithChore(browser: Browser): Promise<[User, User]> {
  const a = await newUser(browser, "Anna", "feminine");
  const b = await newUser(browser, "Bartek", "masculine");
  await pair(a, b);
  await addChore(a.page, TITLE);
  await openTab(b.page, "Planer");
  await expect(b.page.getByText(TITLE)).toBeVisible({ timeout: 30_000 });
  // The clocks are set only now: the relay's invitation uses real time.
  const now = Date.now();
  await a.page.clock.setFixedTime(now + 60_000);
  await b.page.clock.setFixedTime(now + 120_000);
  return [a, b];
}

/** Both go offline, make their edits in order, then come back online. */
async function editOffline(
  [a, b]: [User, User],
  editA: { title?: string; note?: string },
  editB: { title?: string; note?: string },
  finalTitle: string,
) {
  await a.context.setOffline(true);
  await b.context.setOffline(true);
  await editChore(a.page, TITLE, editA);
  await editChore(b.page, TITLE, editB);
  await a.context.setOffline(false);
  await b.context.setOffline(false);
  for (const user of [a, b]) {
    await user.page.reload();
  }
  // A shows its own title at once, so wait until B has received it too (B has
  // already sent its note) and reload A: its editor shows the state at opening.
  await expect(b.page.getByText(finalTitle).first()).toBeVisible({
    timeout: 30_000,
  });
  await a.page.reload();
}

test("the later edit of the same fields wins in both contexts", async ({
  browser,
}) => {
  const users = await pairedWithChore(browser);
  try {
    await editOffline(
      users,
      { title: "Podlać kwiaty (A)" },
      { title: "Podlać kwiaty (B)", note: "Notatka B" },
      "Podlać kwiaty (B)",
    );
    for (const user of users) {
      await expectChore(user.page, "Podlać kwiaty (A)", {
        title: "Podlać kwiaty (B)",
        note: "Notatka B",
      });
    }
  } finally {
    await users[0].context.close();
    await users[1].context.close();
  }
});

test("edits of different fields are both kept in both contexts", async ({
  browser,
}) => {
  const users = await pairedWithChore(browser);
  try {
    await editOffline(
      users,
      { title: "Podlać kwiaty (A)" },
      { note: "Notatka B" },
      "Podlać kwiaty (A)",
    );
    for (const user of users) {
      await expectChore(user.page, TITLE, {
        title: "Podlać kwiaty (A)",
        note: "Notatka B",
      });
    }
  } finally {
    await users[0].context.close();
    await users[1].context.close();
  }
});
