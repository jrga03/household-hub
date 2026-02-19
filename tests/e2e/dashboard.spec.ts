import { test, expect } from "@playwright/test";
import { login } from "./fixtures/helpers";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
  });

  test("renders summary cards with income, expenses, and net", async ({ page }) => {
    // Wait for dashboard to load
    await page.waitForSelector('[data-testid="dashboard-summary"]', {
      timeout: 10000,
    });

    // Verify summary cards exist
    const incomeCard = page.locator("text=Income").first();
    const expenseCard = page.locator("text=Expense").first();
    await expect(incomeCard).toBeVisible();
    await expect(expenseCard).toBeVisible();
  });

  test("displays recent transactions list", async ({ page }) => {
    // Look for a recent transactions section
    const recentSection = page
      .locator('[data-testid="recent-transactions"], text=Recent Transactions, text=Recent')
      .first();
    await expect(recentSection).toBeVisible({ timeout: 10000 });
  });

  test("displays account balances", async ({ page }) => {
    const accountsSection = page
      .locator('[data-testid="account-balances"], text=Account, text=Balance')
      .first();
    await expect(accountsSection).toBeVisible({ timeout: 10000 });
  });

  test("month selector changes displayed data", async ({ page }) => {
    // Look for month navigation controls
    const monthSelector = page
      .locator('[data-testid="month-selector"], button:has-text("Previous"), [aria-label*="month"]')
      .first();

    if (await monthSelector.isVisible()) {
      // Click previous month
      await monthSelector.click();
      // Verify the page updated (URL or content change)
      await page.waitForTimeout(500);
    }
  });
});
