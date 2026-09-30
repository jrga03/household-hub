import { test, expect, type Page } from "@playwright/test";
import { login } from "./fixtures/helpers";
import {
  createTestCategory,
  deleteTestCategory,
  deleteTestTransactions,
  createTestAccount,
  deleteTestAccount,
  type TestCategory,
  type TestAccount,
} from "./fixtures/db-cleanup";

let createdDescriptions: string[] = [];

function uniqueDescription(label: string) {
  const description = `[E2E] ${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  createdDescriptions.push(description);
  return description;
}

function transactionRow(page: Page, description: string) {
  return page.getByRole("main").getByTestId("transaction-row").filter({ hasText: description });
}

async function createExpense(
  page: Page,
  {
    description,
    amount,
    category,
    account,
  }: { description: string; amount: string; category: string; account: string }
) {
  await page.goto("/transactions");
  // The page's own button, not the sidebar's global quick-add
  await page.getByRole("main").getByRole("button", { name: "Add Transaction" }).click();

  const dialog = page.getByRole("dialog", { name: "New Transaction" });
  await dialog.getByRole("textbox", { name: "Amount in Philippine Pesos" }).fill(amount);
  await dialog.getByRole("radio", { name: "Expense" }).click();
  await dialog.getByRole("textbox", { name: "Description" }).fill(description);

  await dialog.getByRole("combobox", { name: "Account" }).click();
  await page.getByRole("option", { name: account, exact: true }).click();

  // Category picker is a searchable Popover+Command combobox (mobile UX 6.8)
  await dialog.getByRole("combobox", { name: "Category" }).click();
  await page.getByRole("option", { name: category, exact: true }).click();

  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("Transactions", () => {
  let category: TestCategory | null = null;
  let account: TestAccount | null = null;

  test.beforeEach(async ({ page }) => {
    // The local stack has no seeded categories; each test brings its own
    category = await createTestCategory("Transactions");
    expect(category, "admin client (.env.test) is required to seed a category").not.toBeNull();
    account = await createTestAccount("Transactions");
    expect(account, "admin client (.env.test) is required to seed an account").not.toBeNull();
    await login(page);
  });

  test.afterEach(async () => {
    await deleteTestTransactions(createdDescriptions);
    createdDescriptions = [];
    await deleteTestCategory(category);
    category = null;
    await deleteTestAccount(account);
    account = null;
  });

  test("should create new transaction", async ({ page }) => {
    const description = uniqueDescription("Create");
    await createExpense(page, {
      description,
      amount: "1500.50",
      category: category!.name,
      account: account!.name,
    });

    const row = transactionRow(page, description);
    await expect(row).toBeVisible();
    await expect(row).toContainText("₱1,500.50");
  });

  test("should edit transaction", async ({ page }) => {
    const description = uniqueDescription("Edit");
    const updatedDescription = `${description} Updated`;
    createdDescriptions.push(updatedDescription);
    await createExpense(page, {
      description,
      amount: "250.00",
      category: category!.name,
      account: account!.name,
    });

    // Below the @[1500px] container breakpoint a row click opens the
    // read-only detail sheet, which exposes an explicit Edit button
    await transactionRow(page, description).click();
    await page.getByRole("dialog").getByRole("button", { name: "Edit", exact: true }).click();

    const form = page.getByRole("dialog", { name: "Edit Transaction" });
    await form.getByRole("textbox", { name: "Description" }).fill(updatedDescription);
    await form.getByRole("button", { name: "Update" }).click();

    await expect(transactionRow(page, updatedDescription)).toBeVisible();
  });

  test("should delete transaction", async ({ page }) => {
    const description = uniqueDescription("Delete");
    await createExpense(page, {
      description,
      amount: "99.00",
      category: category!.name,
      account: account!.name,
    });

    const row = transactionRow(page, description);
    await expect(row).toBeVisible();

    // Row-level Delete confirms via the app-level AlertDialog (review R39)
    await row.getByRole("button", { name: `Delete ${description}` }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();

    await expect(row).toHaveCount(0);
  });

  test("should display account balances in PHP format", async ({ page }) => {
    await page.goto("/accounts");

    const firstAccount = page
      .getByRole("main")
      .getByRole("link", { name: /Current Balance/ })
      .first();

    await expect(firstAccount).toContainText(/₱[\d,]+\.\d{2}/);
  });
});
