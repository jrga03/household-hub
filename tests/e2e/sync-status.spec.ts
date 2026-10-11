import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { signUpNewPerson } from "./fixtures/helpers";

const accountsList = (page: Page) => page.getByRole("list", { name: "Accounts" });
const syncStatus = (page: Page) => page.getByRole("button", { name: /^Sync status:/ });

async function addAccount(page: Page, name: string) {
  const form = page.getByRole("form", { name: "Add an account" });
  await form.getByLabel("Account name").fill(name);
  await form.getByRole("button", { name: "Add account" }).click();
  await expect(accountsList(page)).toContainText(name);
}

/** On phones, Sign Out is in the navigation drawer. */
async function clickSignOut(page: Page) {
  const menu = page.getByRole("button", { name: "Open navigation menu" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Sign Out" }).click();
}

async function startHousehold(page: Page) {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Status home");
  await page.getByRole("button", { name: "Create household" }).click();
  await expect(page.getByText("No accounts yet")).toBeVisible();
}

test("changes made offline wait, then go out on reconnect", async ({ page, context }) => {
  await startHousehold(page);
  await expect(syncStatus(page)).toHaveAccessibleName("Sync status: Synced");

  await context.setOffline(true);
  await expect(syncStatus(page)).toHaveAccessibleName("Sync status: Offline");
  await addAccount(page, "GCash");
  await addAccount(page, "Maya");
  await expect(syncStatus(page)).toHaveAccessibleName("Sync status: Offline · 2 waiting");

  await context.setOffline(false);
  await expect(syncStatus(page)).toHaveAccessibleName("Sync status: Synced", { timeout: 15_000 });
});

test("a refused change is held as stuck until retried or discarded", async ({ page }) => {
  await startHousehold(page);
  // The server refuses every push, as row-level security would.
  await page.route("**/rest/v1/events*", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            code: "42501",
            message: 'new row violates row-level security policy for table "events"',
            details: null,
            hint: null,
          }),
        })
      : route.continue()
  );

  await addAccount(page, "BPI Savings");
  await addAccount(page, "Maya");
  await expect(syncStatus(page)).toHaveAccessibleName("Sync status: 2 stuck", { timeout: 15_000 });

  await syncStatus(page).click();
  const stuck = page.getByRole("list", { name: "Stuck changes" });
  await expect(stuck.getByRole("listitem")).toHaveText([
    /Add account: BPI Savings/,
    /Add account: Maya/,
  ]);

  await page.unroute("**/rest/v1/events*");
  await stuck
    .getByRole("listitem")
    .filter({ hasText: "Maya" })
    .getByRole("button", { name: "Retry" })
    .click();
  await expect(stuck.getByRole("listitem")).toHaveText([/Add account: BPI Savings/]);

  await stuck.getByRole("button", { name: "Discard" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Discard" }).click();

  await expect(syncStatus(page)).toHaveAccessibleName("Sync status: Synced");
  await expect(accountsList(page)).not.toContainText("BPI Savings");
  await expect(accountsList(page)).toContainText("Maya");
});

test("signing out with unsynced changes warns first and can export them", async ({
  page,
  context,
}) => {
  await startHousehold(page);
  await context.setOffline(true);
  await addAccount(page, "GCash");

  await clickSignOut(page);
  const warning = page.getByRole("alertdialog");
  await expect(warning).toContainText("1 change on this device");
  await warning.getByRole("button", { name: "Cancel" }).click();
  await expect(accountsList(page)).toContainText("GCash");

  await clickSignOut(page);
  const download = page.waitForEvent("download");
  await warning.getByRole("button", { name: "Export and sign out" }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toMatch(/^household-hub-unsynced-.*\.json$/);
  const { events } = JSON.parse(await readFile(await exported.path(), "utf8"));
  expect(events).toEqual([
    expect.objectContaining({ eventType: "account.created", pushState: "waiting" }),
  ]);
  await expect(page).toHaveURL(/\/login/);
});
