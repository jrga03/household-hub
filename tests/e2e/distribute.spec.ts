import { test, expect, type Page } from "@playwright/test";
import { chooseOption, signUpNewPerson, navigateTo } from "./fixtures/helpers";

const unassignedItem = (page: Page, account: string) =>
  page
    .getByRole("list", { name: "Unassigned by account" })
    .getByRole("listitem")
    .filter({ has: page.getByText(account, { exact: true }) });

async function addAccount(page: Page, name: string) {
  const form = page.getByRole("form", { name: "Add an account" });
  await form.getByLabel("Account name").fill(name);
  await form.getByLabel("Starting balance (₱)").fill("0");
  await form.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
}

async function setBudget(page: Page, category: string, amount: string, account: string) {
  await page.getByRole("button", { name: `Set budget for ${category}` }).click();
  const dialog = page.getByRole("dialog", { name: `Budget for ${category}` });
  await dialog.getByLabel("Amount (₱)").fill(amount);
  await chooseOption(page, dialog.getByLabel("Funding account"), account);
  await dialog.getByRole("button", { name: "Save budget" }).click();
  await expect(dialog).toBeHidden();
}

test("a payroll distribution leaves the source account's Unassigned at ₱0", async ({ page }) => {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Payday home");
  await page.getByRole("button", { name: "Create household" }).click();
  await navigateTo(page, "Accounts");
  await addAccount(page, "BPI");
  await addAccount(page, "GCash");

  await page.goto("/categories");
  await page.getByRole("button", { name: "Use suggested categories" }).click();
  await setBudget(page, "Groceries", "8000", "BPI");
  await setBudget(page, "Transportation", "3000", "GCash");
  await setBudget(page, "Utilities", "29000", "BPI");

  await page.keyboard.press("n");
  const add = page.getByRole("dialog", { name: "Add transaction" });
  await add.getByRole("radio", { name: "Income" }).check();
  await add.getByLabel("Amount (₱)").fill("40000");
  await chooseOption(page, add.getByLabel("Account"), "BPI");
  await add.getByLabel("Description", { exact: true }).fill("Payday");
  await add.getByRole("button", { name: "Add transaction" }).click();
  await expect(add).toBeHidden();
  await page.getByRole("button", { name: "Distribute" }).click();

  const form = page.getByRole("form", { name: "Distribute money" });
  await expect(page.getByLabel("Income (₱)")).toHaveValue("40,000.00");
  await expect(form.getByRole("textbox", { name: "Groceries" })).toHaveValue("8,000.00");
  await expect(form.getByRole("combobox", { name: "Transportation goes to" })).toHaveText("GCash");
  await expect(form).toContainText("₱0.00 stays in Unassigned");
  await page.screenshot({ path: test.info().outputPath("distribute.png") });
  await form.getByRole("button", { name: "Distribute" }).click();

  await expect(page).toHaveURL(/\/categories/);
  await expect(unassignedItem(page, "BPI")).toContainText("₱0.00");
  await expect(unassignedItem(page, "GCash")).toContainText("₱0.00");
  await page.getByRole("button", { name: "Transportation by account" }).click();
  await expect(page.getByRole("list", { name: "Transportation by account" })).toContainText(
    /GCash.*₱3,000\.00/
  );
});
