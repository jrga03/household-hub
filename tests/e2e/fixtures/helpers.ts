import type { Locator, Page } from "@playwright/test";
import { testUsers } from "./test-users";

export async function login(page: Page, userKey: "primary" | "secondary" = "primary") {
  await loginAs(page, testUsers[userKey]);
}

export async function loginAs(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.fill('[name="email"]', user.email);
  await page.fill('[name="password"]', user.password);
  await page.click('button[type="submit"]');

  // Wait for redirect away from /login to the home page
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** Signs up a fresh person, who belongs to no household. */
export async function signUpNewPerson(page: Page) {
  const person = {
    email: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    password: "TestPassword123!",
  };
  await page.goto("/signup");
  await page.fill('[name="email"]', person.email);
  await page.fill('[name="password"]', person.password);
  await page.fill('[name="confirmPassword"]', person.password);
  await page.click('button[type="submit"]');
  return person;
}

/** Opens a select field and picks the option with exactly that name. */
export async function chooseOption(page: Page, field: Locator, option: string) {
  await field.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

const TAB_LABELS = ["Home", "Transactions"];

/**
 * Follows a navigation link: the tab bar or drawer at phone widths, the sidebar
 * otherwise. The sidebar comes first in the DOM, ahead of same-named page links.
 */
export async function navigateTo(page: Page, label: string) {
  const isPhoneWidth = (page.viewportSize()?.width ?? Infinity) < 600;
  if (!isPhoneWidth) {
    // A sidebar link's name ends with its shortcut ("Settings g s")
    await page.getByRole("link", { name: label }).first().click();
  } else if (TAB_LABELS.includes(label)) {
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: label })
      .click();
  } else {
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    const drawer = page.getByRole("dialog");
    // Review's name carries its count ("Review, 2 to review")
    const name = new RegExp(`^${label}(, \\d+ to review)?$`);
    await drawer.getByRole("link", { name }).click();
    // Keys like "n" are ignored while a dialog is open, so wait for the drawer to close.
    await drawer.waitFor({ state: "hidden" });
  }
}
