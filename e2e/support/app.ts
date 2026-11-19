import {
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

/** The origin the web build is served from; it is also the relay's CORS origin. */
export const WEB_URL = "http://localhost:8100";

/** The grammatical forms of onboarding, matched by the start of their label. */
const FORM_LABELS = {
  feminine: /^Żeńskiej/,
  masculine: /^Męskiej/,
  neutral: /^Neutralnej/,
};

export type Form = keyof typeof FORM_LABELS;

export interface User {
  readonly name: string;
  readonly context: BrowserContext;
  readonly page: Page;
}

async function next(page: Page, label = "Dalej") {
  await page.getByRole("button", { name: label, exact: true }).click();
}

/** Onboarding of an adult without a cycle and without a PIN. */
export async function onboard(page: Page, name: string, form: Form) {
  await page.getByLabel("Imię", { exact: true }).fill(name);
  await next(page);
  await page.getByRole("radio", { name: FORM_LABELS[form] }).click();
  await next(page);
  await page.getByRole("checkbox", { name: /^Potwierdzam/ }).click();
  await next(page);
  await page.getByRole("radio", { name: "1–3 lata" }).click();
  await next(page);
  await page.getByRole("radio", { name: "Nie", exact: true }).click();
  await next(page);
  await next(page);
  await page.getByRole("radio", { name: "Nie", exact: true }).click();
  await next(page);
  await page.getByRole("button", { name: "Pomiń na razie" }).click();
  await next(page);
  await next(page, "Zaczynamy");
  await expect(page.getByRole("tab", { name: "Ustawienia" })).toBeVisible();
}

/** A person with their own browser context, so with their own IndexedDB. */
export async function newUser(
  browser: Browser,
  name: string,
  form: Form,
): Promise<User> {
  const context = await browser.newContext();
  await context.grantPermissions(
    ["clipboard-read", "clipboard-write", "notifications"],
    { origin: WEB_URL },
  );
  const page = await context.newPage();
  await page.goto(WEB_URL);
  await onboard(page, name, form);
  return { name, context, page };
}

export async function openTab(page: Page, tab: string) {
  await page.getByRole("tab", { name: tab, exact: true }).click();
}

/**
 * Adds a daily chore from the Planner, so that today's occurrence shows
 * in the "Dziś" view (the default kind has no due date and shows nowhere).
 */
export async function addChore(page: Page, title: string) {
  await openTab(page, "Planer");
  await page
    .getByRole("button", { name: /^Dodaj (pierwszy )?obowiązek$/ })
    .click();
  await page.getByLabel("Tytuł", { exact: true }).fill(title);
  await page.getByRole("radio", { name: "Codziennie" }).click();
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(page.getByText(title)).toBeVisible();
}

/** The inviter copies the link of a new invitation and reads it back. */
async function createInvitation(page: Page): Promise<string> {
  await openTab(page, "Ustawienia");
  await page.getByRole("button", { name: "Zaproś partnera" }).click();
  await page.getByRole("button", { name: "Kopiuj link" }).click();
  await expect(page.getByText("Link skopiowany.")).toBeVisible();
  return page.evaluate(() => navigator.clipboard.readText());
}

/** Both people see the same six digits and confirm them; the default consents stay. */
async function confirmPair(a: Page, b: Page) {
  const codes: string[] = [];
  for (const page of [a, b]) {
    const code = page.getByText(/^\d{6}$/);
    await expect(code).toBeVisible();
    codes.push(await code.innerText());
  }
  expect(codes[0]).toBe(codes[1]);
  for (const page of [a, b]) {
    await page.getByRole("button", { name: "Kody są takie same" }).click();
    await page.getByRole("button", { name: "Zapisz wybór" }).click();
  }
}

/** The Settings tab of `user` says they are in a pair with `partner`. */
export async function expectPaired(user: User, partner: User) {
  await openTab(user.page, "Ustawienia");
  await expect(
    user.page.getByText(`Jesteście w parze z ${partner.name}.`),
  ).toBeVisible();
}

/** Pairs two onboarded people through the local relay. */
export async function pair(a: User, b: User) {
  const link = await createInvitation(a.page);
  await b.page.goto(link);
  await confirmPair(a.page, b.page);
  await expectPaired(a, b);
  await expectPaired(b, a);
}
