import { test, expect, type Page } from "@playwright/test";
import { signUpNewPerson } from "./fixtures/helpers";

const bankItem = (page: Page) =>
  page.getByRole("list", { name: "Accounts" }).getByRole("listitem").filter({ hasText: "BPI" });

async function chooseOption(page: Page, label: string, option: string) {
  await page.getByRole("dialog").getByLabel(label).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("transactions recorded offline move the balance, and a removal can be undone", async ({
  page,
}) => {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Transaction home");
  await page.getByRole("button", { name: "Create household" }).click();

  const addAccount = page.getByRole("form", { name: "Add an account" });
  await addAccount.getByLabel("Account name").fill("BPI");
  await addAccount.getByLabel("Starting balance (₱)").fill("1000");
  await addAccount.getByRole("button", { name: "Add account" }).click();
  await expect(bankItem(page)).toContainText("₱1,000.00");

  await page.getByRole("link", { name: "Categories" }).click();
  await page.getByRole("button", { name: "Use suggested categories" }).click();
  await expect(page.getByRole("list", { name: "Food categories" })).toContainText("Groceries");
  await page.getByRole("link", { name: "Home" }).click();

  await page.context().setOffline(true);

  await page.keyboard.press("n");
  const dialog = page.getByRole("dialog", { name: "Add transaction" });
  await expect(dialog.getByLabel("Amount (₱)")).toBeFocused();
  await dialog.getByLabel("Amount (₱)").fill("250");
  await chooseOption(page, "Category", "Groceries");
  await dialog.getByLabel("Description (optional)").fill("Market");
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
  await dialog.getByRole("button", { name: "Add transaction" }).click();
  await expect(bankItem(page)).toContainText("₱1,750.00");
  await expect(bankItem(page)).toContainText("Cleared ₱750.00 · Pending ₱1,000.00");
  await expect(bankItem(page)).toContainText("Unassigned ₱2,000.00");

  await page.getByRole("link", { name: "Transactions" }).click();
  const list = page.getByRole("list", { name: "Transactions" });
  const market = list.getByRole("listitem").filter({ hasText: "Market" });
  await market.getByRole("button", { name: "Remove" }).click();
  await expect(market).toBeHidden();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(market).toBeVisible();
});
