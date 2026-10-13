import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { loginAs, signUpNewPerson, navigateTo } from "./fixtures/helpers";
import { AUTH_STORAGE_KEY } from "../../src/lib/auth-storage";

const accountsList = (page: Page) => page.getByRole("list", { name: "Accounts" });

/** A member whose access token has expired opens the app with no connection. */
async function openOfflineWithExpiredToken(page: Page, context: BrowserContext, household: string) {
  const person = await signUpNewPerson(page);
  await page.getByLabel("Household name").fill(household);
  await page.getByRole("button", { name: "Create household" }).click();
  await expect(page.getByRole("main").getByText(household)).toBeVisible();

  // The service worker serves the app only to pages it controls.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);

  await page.evaluate((key) => {
    const session = JSON.parse(window.localStorage.getItem(key) ?? "null");
    if (!session) throw new Error("No stored session");
    session.expires_at = Math.floor(Date.now() / 1000) - 3600;
    window.localStorage.setItem(key, JSON.stringify(session));
  }, AUTH_STORAGE_KEY);

  await context.setOffline(true);
  await page.reload();
  return person;
}

test("offline with an expired access token, a member still reaches home", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  await openOfflineWithExpiredToken(page, context, "Expired token home");

  // Well under the ~26 s auth-js spends retrying the refresh.
  await expect(page.getByRole("main").getByText("Expired token home")).toBeVisible({
    timeout: 3_000,
  });
  await expect(page).toHaveURL((url) => url.pathname === "/");

  // auth-js gives up on the refresh after about 26 s; the member stays signed in.
  await page.waitForTimeout(30_000);
  await navigateTo(page, "Settings");
  await expect(page).toHaveURL((url) => url.pathname === "/settings");
});

test("back online, the token refreshes and changes made offline sync without signing in again", async ({
  page,
  context,
  browser,
}) => {
  const person = await openOfflineWithExpiredToken(page, context, "Reconnect home");
  await expect(page.getByRole("main").getByText("Reconnect home")).toBeVisible();

  const form = page.getByRole("form", { name: "Add an account" });
  await form.getByLabel("Account name").fill("Offline wallet");
  await form.getByRole("button", { name: "Add account" }).click();
  await expect(accountsList(page)).toContainText("Offline wallet");

  await context.setOffline(false);
  await expect(page.getByRole("button", { name: /^Sync status:/ })).toHaveAccessibleName(
    "Sync status: Synced",
    { timeout: 20_000 }
  );
  await expect(page).toHaveURL((url) => url.pathname === "/");
  const storedExpiry = () =>
    page.evaluate(
      (key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").expires_at,
      AUTH_STORAGE_KEY
    );
  await expect.poll(storedExpiry).toBeGreaterThan(Date.now() / 1000);

  const otherDevice = await browser.newContext();
  const otherPage = await otherDevice.newPage();
  await loginAs(otherPage, person);
  await expect(accountsList(otherPage)).toContainText("Offline wallet");
  await otherDevice.close();
});
