import { test, expect } from "@playwright/test";

test.describe("Transactions", () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');
  });

  test("should create new transaction", async ({ page }) => {
    await page.goto("/transactions");
    await page.click("text=Add Transaction");

    // Fill form
    await page.fill('[name="description"]', "Test Expense");
    await page.fill('[name="amount"]', "1500.50");
    await page.selectOption('[name="type"]', "expense");
    await page.selectOption('[name="account"]', { index: 1 });

    // Category picker is a searchable Popover+Command combobox (mobile UX
    // 6.8), not a native select
    await page.getByRole("combobox", { name: "Select category" }).click();
    await page.getByRole("option").first().click();

    await page.click('button[type="submit"]');

    // Verify created
    await expect(page.getByText("Test Expense")).toBeVisible();
    await expect(page.getByText("₱1,500.50")).toBeVisible();
  });

  test("should edit transaction", async ({ page }) => {
    await page.goto("/transactions");

    // Click first transaction. Below the @[1500px] container breakpoint this
    // opens the read-only detail sheet (wide layouts select into the detail
    // pane instead); both surfaces expose an explicit Edit button.
    await page.click('[data-testid="transaction-row"]:first-child');

    // Edit from the detail sheet. Role-scoped to the dialog: a bare
    // `text=Edit` first-matches any copy containing the word before the
    // button and times out on the hit-target check.
    await page.getByRole("dialog").getByRole("button", { name: "Edit", exact: true }).click();
    await page.fill('[name="description"]', "Updated Description");
    await page.click('button[type="submit"]');

    // Verify updated
    await expect(page.getByText("Updated Description")).toBeVisible();
  });

  test("should delete transaction", async ({ page }) => {
    await page.goto("/transactions");

    const firstRow = page.locator('[data-testid="transaction-row"]').first();
    const transactionText = await firstRow.textContent();

    // Row-level Delete confirms via the app-level AlertDialog (review R39)
    await firstRow.getByRole("button", { name: /^Delete / }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();

    // Verify deleted
    await expect(page.getByText(transactionText!)).not.toBeVisible();
  });

  test("should calculate account balance correctly", async ({ page }) => {
    await page.goto("/accounts");

    // Get first account balance
    const balance = await page.locator('[data-testid="account-balance"]:first-child').textContent();

    // Verify format
    expect(balance).toMatch(/₱[\d,]+\.\d{2}/);
  });
});
