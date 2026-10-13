import { test, expect, type Page } from "@playwright/test";
import { chooseOption, signUpNewPerson, navigateTo } from "./fixtures/helpers";

const bankItem = (page: Page) =>
  page.getByRole("list", { name: "Accounts" }).getByRole("listitem").filter({ hasText: "BPI" });

test("transactions recorded offline move the balance, and a removal can be undone", async ({
  page,
}) => {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Transaction home");
  await page.getByRole("button", { name: "Create household" }).click();
  await navigateTo(page, "Accounts");

  const addAccount = page.getByRole("form", { name: "Add an account" });
  await addAccount.getByLabel("Account name").fill("BPI");
  await addAccount.getByLabel("Starting balance (₱)").fill("1000");
  await addAccount.getByRole("button", { name: "Add account" }).click();
  await expect(bankItem(page)).toContainText("₱1,000.00");

  await navigateTo(page, "Categories");
  await page.getByRole("button", { name: "Use suggested categories" }).click();
  await expect(page.getByRole("list", { name: "Food categories" })).toContainText("Groceries");
  await navigateTo(page, "Accounts");

  await page.context().setOffline(true);

  await page.keyboard.press("n");
  const dialog = page.getByRole("dialog", { name: "Add transaction" });
  await expect(dialog.getByLabel("Amount (₱)")).toBeFocused();
  await dialog.getByLabel("Amount (₱)").fill("250");
  await chooseOption(page, dialog.getByLabel("Category"), "Groceries");
  await dialog.getByLabel("Description", { exact: true }).fill("Market");
  await dialog.getByRole("button", { name: "Add transaction" }).click();
  await expect(dialog).toBeHidden();
  await expect(bankItem(page)).toContainText("₱750.00");
  await expect(bankItem(page)).toContainText("Unassigned ₱1,000.00");

  await page.getByRole("button", { name: "Add transaction" }).click();
  await expect(dialog.getByLabel("Category")).toHaveText("Groceries");
  await dialog.getByLabel("Amount (₱)").fill("1000");
  await dialog.getByRole("radio", { name: "Income" }).check();
  await expect(dialog.getByLabel("Category")).toHaveText("Unassigned");
  await dialog.getByRole("radio", { name: "Pending" }).check();
  await dialog.getByLabel("Description", { exact: true }).fill("Salary");
  await dialog.getByRole("button", { name: "Add transaction" }).click();
  await expect(bankItem(page)).toContainText("₱1,750.00");
  await expect(bankItem(page)).toContainText("Cleared ₱750.00 · Pending ₱1,000.00");
  await expect(bankItem(page)).toContainText("Unassigned ₱2,000.00");

  // Tapping an account opens Transactions filtered to it.
  await bankItem(page).getByRole("link", { name: "BPI" }).click();
  await expect(page).toHaveURL(/\/transactions\?account=/);
  const list = page.getByRole("list", { name: "Transactions" });
  const market = list.getByRole("listitem").filter({ hasText: "Market" });
  await market.getByRole("button", { name: "Edit Market" }).click();
  await page
    .getByRole("dialog", { name: "Edit transaction" })
    .getByRole("button", { name: "Remove" })
    .click();
  const confirm = page.getByRole("alertdialog", { name: "Remove “Market” ₱250.00?" });
  await confirm.getByRole("button", { name: "Remove" }).click();
  await expect(market).toBeHidden();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(market).toBeVisible();
});
