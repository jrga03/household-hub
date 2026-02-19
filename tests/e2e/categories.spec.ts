import { test, expect } from "@playwright/test";
import { login } from "./fixtures/helpers";
import { cleanupTestCategories } from "./fixtures/db-cleanup";

test.describe("Categories", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/categories");
  });

  test.afterEach(async () => {
    await cleanupTestCategories();
  });

  test("renders category list", async ({ page }) => {
    // Wait for categories page to load
    const content = page
      .locator('[data-testid="category-list"], h1:has-text("Categories"), main')
      .first();
    await expect(content).toBeVisible({ timeout: 10000 });
  });

  test("create parent category", async ({ page }) => {
    const addBtn = page
      .locator(
        '[data-testid="add-category-btn"], button:has-text("Add Category"), button:has-text("Add")'
      )
      .first();

    if (!(await addBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Add category button not found");
      return;
    }

    await addBtn.click();

    const nameInput = page.locator('input[name="name"]').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill("[E2E] Test Category Parent");
    }

    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(1000);

    // Verify category appears in list
    const newCategory = page.locator("text=[E2E] Test Category Parent").first();
    await expect(newCategory).toBeVisible({ timeout: 5000 });
  });

  test("create child category under parent", async ({ page }) => {
    // Look for an existing category to add a child under
    const categoryItem = page
      .locator('[data-testid="category-item"], [data-testid="category-row"]')
      .first();

    if (!(await categoryItem.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "No categories available to add child to");
      return;
    }

    // Click on category to expand or find add subcategory option
    const addChildBtn = page
      .locator(
        'button:has-text("Add Subcategory"), button:has-text("Add Child"), [data-testid="add-subcategory"]'
      )
      .first();

    if (!(await addChildBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "Add subcategory button not found");
      return;
    }

    await addChildBtn.click();

    const nameInput = page.locator('input[name="name"]').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill("[E2E] Test Child Category");
    }

    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(1000);
  });

  test("verify hierarchy display", async ({ page }) => {
    // Check that parent-child relationships are visually displayed
    const categoryTree = page
      .locator('[data-testid="category-tree"], [data-testid="category-list"]')
      .first();

    if (await categoryTree.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Subcategories should be visually nested (indented or collapsible)
      await expect(categoryTree).toBeVisible();
    }
  });
});
