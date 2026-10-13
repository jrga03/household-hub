import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { chooseOption, loginAs, signUpNewPerson, navigateTo } from "./fixtures/helpers";

const accountItem = (page: Page, name: string) =>
  page
    .getByRole("list", { name: "Accounts" })
    .getByRole("listitem")
    .filter({ hasText: new RegExp(`^${name}`) });

/** Reconnecting makes an open device pull; repeat until the other device's push has landed. */
async function pullUntil(device: BrowserContext, item: Locator, text: string) {
  await expect(async () => {
    await device.setOffline(true);
    await device.setOffline(false);
    await expect(item).toContainText(text, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

test("a transfer recorded offline moves both balances on another device", async ({ browser }) => {
  const deviceA = await browser.newContext();
  const pageA = await deviceA.newPage();
  const person = await signUpNewPerson(pageA);
  await pageA.getByLabel("Household name").fill("Transfer home");
  await pageA.getByRole("button", { name: "Create household" }).click();

  const addAccount = pageA.getByRole("form", { name: "Add an account" });
  await addAccount.getByLabel("Account name").fill("BPI");
  await addAccount.getByLabel("Starting balance (₱)").fill("10000");
  await addAccount.getByRole("button", { name: "Add account" }).click();
  await expect(accountItem(pageA, "BPI")).toContainText("₱10,000.00");
  await addAccount.getByLabel("Account name").fill("GCash");
  await addAccount.getByLabel("Starting balance (₱)").fill("0");
  await addAccount.getByRole("button", { name: "Add account" }).click();
  await expect(accountItem(pageA, "GCash")).toBeVisible();

  await navigateTo(pageA, "Categories");
  await pageA.getByRole("button", { name: "Use suggested categories" }).click();
  await expect(pageA.getByRole("list", { name: "Food categories" })).toContainText("Groceries");
  await pageA.getByRole("link", { name: "Home" }).click();

  const deviceB = await browser.newContext();
  const pageB = await deviceB.newPage();
  await loginAs(pageB, person);
  await pullUntil(deviceB, accountItem(pageB, "GCash"), "₱0.00");

  await deviceA.setOffline(true);
  await pageA.keyboard.press("n");
  const dialog = pageA.getByRole("dialog", { name: "Add transaction" });
  await dialog.getByLabel("Amount (₱)").fill("2000");
  await dialog.getByRole("radio", { name: "Transfer" }).click();
  await expect(dialog.getByLabel("Amount (₱)")).toHaveValue("2000");
  await chooseOption(pageA, dialog.getByLabel("From"), "BPI");
  await chooseOption(pageA, dialog.getByLabel("To"), "GCash");
  await chooseOption(pageA, dialog.getByLabel("Category"), "Groceries");
  await dialog.getByRole("button", { name: "Add transfer" }).click();
  await expect(dialog).toBeHidden();
  await expect(accountItem(pageA, "GCash").getByLabel("Balance")).toHaveText("₱2,000.00");
  await deviceA.setOffline(false);

  await pullUntil(deviceB, accountItem(pageB, "GCash"), "₱2,000.00");
  await expect(accountItem(pageB, "BPI").getByLabel("Balance")).toHaveText("₱8,000.00");
  await expect(accountItem(pageB, "GCash").getByLabel("Balance")).toHaveText("₱2,000.00");

  // One row for both legs, named for where the money went.
  await pageB.getByRole("link", { name: "Transactions" }).first().click();
  const rows = pageB.getByRole("list", { name: "Transactions" });
  await expect(rows.getByRole("listitem")).toHaveCount(1);
  await expect(rows.getByRole("listitem")).toContainText("Transfer to GCash");
  await expect(rows).toContainText("Groceries · BPI → GCash");

  await Promise.all([deviceA.close(), deviceB.close()]);
});
