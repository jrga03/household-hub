import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { chooseOption, loginAs, signUpNewPerson, navigateTo } from "./fixtures/helpers";

// Anchored: a card's row also names its Paying Account.
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

test("a card purchase recorded offline reserves its amount in the Paying Account on another device", async ({
  browser,
}) => {
  const deviceA = await browser.newContext();
  const pageA = await deviceA.newPage();
  const person = await signUpNewPerson(pageA);
  await pageA.getByLabel("Household name").fill("Card Payment home");
  await pageA.getByRole("button", { name: "Create household" }).click();
  await navigateTo(pageA, "Accounts");

  const addAccount = pageA.getByRole("form", { name: "Add an account" });
  await addAccount.getByLabel("Account name").fill("BDO Savings");
  await addAccount.getByLabel("Starting balance (₱)").fill("5000");
  await addAccount.getByRole("button", { name: "Add account" }).click();
  await expect(accountItem(pageA, "BDO Savings")).toContainText("₱5,000.00");
  await addAccount.getByLabel("Account name").fill("Visa");
  await chooseOption(pageA, addAccount.getByLabel("Type"), "Credit card");
  await chooseOption(pageA, addAccount.getByLabel("Paid from"), "BDO Savings");
  await addAccount.getByRole("button", { name: "Add account" }).click();
  await expect(accountItem(pageA, "Visa")).toContainText("Paid from BDO Savings");

  await navigateTo(pageA, "Categories");
  await pageA.getByRole("button", { name: "Use suggested categories" }).click();
  await expect(pageA.getByRole("list", { name: "Food categories" })).toContainText("Restaurants");
  await navigateTo(pageA, "Accounts");

  const deviceB = await browser.newContext();
  const pageB = await deviceB.newPage();
  await loginAs(pageB, person);
  await navigateTo(pageB, "Accounts");
  await pullUntil(deviceB, accountItem(pageB, "Visa"), "Paid from BDO Savings");

  await deviceA.setOffline(true);
  await pageA.keyboard.press("n");
  const dialog = pageA.getByRole("dialog", { name: "Add transaction" });
  await dialog.getByLabel("Amount (₱)").fill("1200");
  await chooseOption(pageA, dialog.getByLabel("Account"), "Visa");
  await chooseOption(pageA, dialog.getByLabel("Category"), "Restaurants");
  await dialog.getByLabel("Description", { exact: true }).fill("Dinner");
  await dialog.getByRole("button", { name: "Add transaction" }).click();
  await expect(dialog).toBeHidden();
  await expect(accountItem(pageA, "BDO Savings")).toContainText("Card Payment · Visa ₱1,200.00");
  await deviceA.setOffline(false);

  await pullUntil(deviceB, accountItem(pageB, "Visa"), "₱1,200.00");
  const savings = accountItem(pageB, "BDO Savings");
  await expect(savings.getByLabel("Balance")).toHaveText("₱5,000.00");
  await expect(savings).toContainText("Unassigned ₱5,000.00");
  await expect(savings).toContainText("Card Payment · Visa ₱1,200.00");

  await Promise.all([deviceA.close(), deviceB.close()]);
});
