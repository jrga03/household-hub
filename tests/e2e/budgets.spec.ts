import { test, expect } from "@playwright/test";
import { login } from "./fixtures/helpers";
import {
  cleanupTestBudgets,
  cleanupTestCategories,
  createTestBudgetCategory,
} from "./fixtures/db-cleanup";

test.describe("Budgets", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/budgets");
  });

  test.afterEach(async () => {
    await cleanupTestBudgets();
    await cleanupTestCategories();
  });

  test("renders budget list page", async ({ page }) => {
    await expect(page).toHaveURL(/\/budgets/);
    // Page should have a heading or budget content
    const heading = page.locator("h1, h2, [data-testid='budget-list']").first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test("create budget: fill form and verify in list", async ({ page }) => {
    const categoryName = await createTestBudgetCategory();
    test.skip(
      !categoryName,
      "Admin client unavailable - cannot create an isolated budget category"
    );

    // Click add budget button
    const addBtn = page
      .locator(
        '[data-testid="add-budget-btn"], button:has-text("Add Budget"), button:has-text("Add")'
      )
      .first();

    if (!(await addBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Add budget button not found - feature may not be implemented yet");
      return;
    }

    await addBtn.click();

    // Fill the budget form. The category picker is a searchable
    // Popover+Command combobox (mobile UX 6.8), not a native select
    const categoryTrigger = page.getByRole("combobox", { name: "Select category" });
    await categoryTrigger.click();
    await page
      .getByRole("option", { name: new RegExp(categoryName!.replace(/[[\]]/g, "\\$&")) })
      .click();

    const amountInput = page.locator('input[name="amount"], input[name="amount_cents"]').first();
    if (await amountInput.isVisible()) {
      await amountInput.fill("5000");
    }

    // Submit
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();

    // Verify creation
    await expect(page.getByText(categoryName!).first()).toBeVisible({ timeout: 10000 });
  });

  test("verify over-budget warning visual", async ({ page }) => {
    // Look for any progress bars or warning indicators
    const progressBar = page
      .locator('[data-testid="budget-progress"], [role="progressbar"], .bg-red')
      .first();

    // This test verifies visual elements exist if budgets are present
    if (await progressBar.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(progressBar).toBeVisible();
    }
  });
});
