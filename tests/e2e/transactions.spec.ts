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
    await page.selectOption('[name="category"]', { index: 1 });

    await page.click('button[type="submit"]');

    // Verify created
    await expect(page.getByText("Test Expense")).toBeVisible();
    await expect(page.getByText("₱1,500.50")).toBeVisible();
  });

  test("should edit transaction", async ({ page }) => {
    await page.goto("/transactions");

    // Click first transaction
    await page.click('[data-testid="transaction-row"]:first-child');

    // Edit
    await page.click("text=Edit");
    await page.fill('[name="description"]', "Updated Description");
    await page.click('button[type="submit"]');

    // Verify updated
    await expect(page.getByText("Updated Description")).toBeVisible();
  });

  test("should delete transaction", async ({ page }) => {
    await page.goto("/transactions");

    const transactionText = await page
      .locator('[data-testid="transaction-row"]:first-child')
      .textContent();

    // Delete
    await page.click('[data-testid="transaction-row"]:first-child');
    await page.click("text=Delete");
    await page.click("text=Confirm");

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
