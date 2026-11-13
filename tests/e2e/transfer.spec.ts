import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import {
  addAccount,
  chooseOption,
  loginAs,
  signUpNewPerson,
  navigateTo,
  transactionRows,
} from "./fixtures/helpers";

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
  await navigateTo(pageA, "Accounts");

  await addAccount(pageA, "BPI", "10000");
  await expect(accountItem(pageA, "BPI")).toContainText("₱10,000.00");
  await addAccount(pageA, "GCash", "0");
  await expect(accountItem(pageA, "GCash")).toBeVisible();

  await navigateTo(pageA, "Categories");
  await pageA.getByRole("button", { name: "Use suggested categories" }).click();
  await expect(pageA.getByRole("list", { name: "Food categories" })).toContainText("Groceries");
  await navigateTo(pageA, "Accounts");

  const deviceB = await browser.newContext();
  const pageB = await deviceB.newPage();
  await loginAs(pageB, person);
  await navigateTo(pageB, "Accounts");
  await pullUntil(deviceB, accountItem(pageB, "GCash"), "₱0.00");

  await deviceA.setOffline(true);
  await pageA.keyboard.press("n");
  const dialog = pageA.getByRole("dialog", { name: "Add transaction" });
  await dialog.getByLabel("Amount (₱)").fill("2000");
  await dialog.getByRole("radio", { name: "Move money" }).click();
  const move = pageA.getByRole("dialog", { name: "Move money" });
  await expect(move.getByLabel("Amount (₱)")).toHaveValue("2000.00");
  await chooseOption(pageA, move.getByLabel("From", { exact: true }), "BPI");
  await chooseOption(pageA, move.getByLabel("To", { exact: true }), "GCash");
  await chooseOption(pageA, move.getByLabel("From category"), "Groceries");
  await move.getByRole("button", { name: "Add transfer" }).click();
  await expect(move).toBeHidden();
  await expect(accountItem(pageA, "GCash")).toContainText("₱2,000.00");
  await deviceA.setOffline(false);

  await pullUntil(deviceB, accountItem(pageB, "GCash"), "₱2,000.00");
  await expect(accountItem(pageB, "BPI")).toContainText("₱8,000.00");
  await expect(accountItem(pageB, "GCash")).toContainText("₱2,000.00");

  // One row for both legs, named for where the money went.
  await pageB.getByRole("link", { name: "Transactions" }).first().click();
  const rows = transactionRows(pageB);
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("Transfer to GCash");
  await expect(rows).toContainText("Groceries");
  await expect(rows).toContainText("BPI → GCash");

  await Promise.all([deviceA.close(), deviceB.close()]);
});
