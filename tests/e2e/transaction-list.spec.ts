import { test, expect, type Page } from "@playwright/test";
import { format } from "date-fns";
import { chooseOption, signUpNewPerson } from "./fixtures/helpers";

interface Entry {
  amount: string;
  description: string;
  category?: string;
  income?: boolean;
}

async function addTransaction(page: Page, entry: Entry) {
  await page.keyboard.press("n");
  const dialog = page.getByRole("dialog", { name: "Add transaction" });
  await dialog.getByLabel("Amount (₱)").fill(entry.amount);
  if (entry.income) await dialog.getByRole("radio", { name: "Income" }).check();
  if (entry.category) await chooseOption(page, dialog.getByLabel("Category"), entry.category);
  await dialog.getByLabel("Description (optional)").fill(entry.description);
  await dialog.getByRole("button", { name: "Add transaction" }).click();
  await expect(dialog).toBeHidden();
}

test("filters combine, and the totals and search follow them", async ({ page }) => {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("List home");
  await page.getByRole("button", { name: "Create household" }).click();

  const addAccount = page.getByRole("form", { name: "Add an account" });
  await addAccount.getByLabel("Account name").fill("BPI");
  await addAccount.getByLabel("Starting balance (₱)").fill("10000");
  await addAccount.getByRole("button", { name: "Add account" }).click();

  await page.getByRole("link", { name: "Categories" }).click();
  await page.getByRole("button", { name: "Use suggested categories" }).click();
  await expect(page.getByRole("list", { name: "Food categories" })).toContainText("Groceries");

  await page.getByRole("link", { name: "Transactions" }).click();
  await addTransaction(page, { amount: "250", description: "Market", category: "Groceries" });
  await addTransaction(page, { amount: "120.50", description: "Bakery", category: "Groceries" });
  await addTransaction(page, { amount: "250", description: "Dinner", category: "Restaurants" });
  await addTransaction(page, { amount: "1000", description: "Salary", income: true });
  await addTransaction(page, { amount: "80", description: "Parking", category: "Unassigned" });

  const list = page.getByRole("list", { name: "Transactions" });
  const totals = page.getByRole("region", { name: "Totals" });
  const filters = page.getByRole("search", { name: "Filter transactions" });
  await expect(list.getByRole("listitem")).toHaveCount(5);
  await expect(totals.getByRole("group", { name: "Income" })).toContainText("₱1,000.00");
  await expect(totals.getByRole("group", { name: "Expenses" })).toContainText("₱700.50");
  await expect(totals.getByRole("group", { name: "Net" })).toContainText("₱299.50");

  await chooseOption(
    page,
    filters.getByLabel("Month", { exact: true }),
    format(new Date(), "MMMM yyyy")
  );
  await chooseOption(page, filters.getByLabel("Category", { exact: true }), "Groceries");
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(totals.getByRole("group", { name: "Income" })).toContainText("₱0.00");
  await expect(totals.getByRole("group", { name: "Expenses" })).toContainText("₱370.50");
  await expect(totals.getByRole("group", { name: "Net" })).toContainText("-₱370.50");

  await filters.getByRole("button", { name: "Clear filters" }).click();
  const search = filters.getByLabel("Search description, notes or amount");
  await search.pressSequentially("250");
  await expect(search).toHaveValue("250");
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list).toContainText("Market");
  await expect(list).toContainText("Dinner");
  await expect(totals.getByRole("group", { name: "Expenses" })).toContainText("₱500.00");

  await search.fill("");
  await page.getByRole("link", { name: "1 expense needs a category" }).click();
  await expect(filters.getByLabel("Needs a category")).toBeChecked();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list).toContainText("Parking");
  await expect(totals.getByRole("group", { name: "Expenses" })).toContainText("₱80.00");
});
