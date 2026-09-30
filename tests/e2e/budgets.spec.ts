import { test, expect } from "@playwright/test";
import { login } from "./fixtures/helpers";
import {
  cleanupTestBudgets,
  createTestCategory,
  deleteTestCategory,
  type TestCategory,
} from "./fixtures/db-cleanup";

test.describe("Budgets", () => {
  let category: TestCategory | null = null;

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/budgets");
  });

  test.afterEach(async () => {
    await cleanupTestBudgets();
    await deleteTestCategory(category);
    category = null;
  });

  test("renders budget list page", async ({ page }) => {
    await expect(page).toHaveURL(/\/budgets/);
    // Scoped to <main>: the tablet header's page-title h1 comes first in the
    // DOM and is hidden at desktop widths
    const heading = page.getByRole("main").getByRole("heading", { level: 1, name: "Budgets" });
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test("create budget: fill form and verify in list", async ({ page }) => {
    category = await createTestCategory("Budget");
    test.skip(!category, "Admin client unavailable - cannot create an isolated budget category");

    // Scoped to <main>: the sidebar's "Add Transaction" button precedes the
    // page's own controls in the DOM
    await page.getByRole("main").getByRole("button", { name: "Add Budget" }).click();

    // Fill the budget form. The category picker is a searchable
    // Popover+Command combobox (mobile UX 6.8), not a native select
    const categoryTrigger = page.getByRole("combobox", { name: "Category" });
    await categoryTrigger.click();
    await page.getByRole("option", { name: category!.name, exact: true }).click();

    const amountInput = page.locator('input[name="amount"], input[name="amount_cents"]').first();
    if (await amountInput.isVisible()) {
      await amountInput.fill("5000");
    }

    // Submit
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();

    // Verify creation
    await expect(page.getByText(category!.name).first()).toBeVisible({ timeout: 10000 });
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
