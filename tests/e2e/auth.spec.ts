import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("should sign up new user", async ({ page }) => {
    await page.goto("/signup");

    await page.fill('[name="email"]', `test-${Date.now()}@example.com`);
    await page.fill('[name="password"]', "TestPassword123!");
    await page.fill('[name="confirmPassword"]', "TestPassword123!");

    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(/welcome/i)).toBeVisible();
  });

  test("should sign in existing user", async ({ page }) => {
    await page.goto("/login");

    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "TestPassword123!");

    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("should sign out", async ({ page, context }) => {
    // Sign in first
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');

    // Sign out
    await page.click('[aria-label="User menu"]');
    await page.click("text=Sign out");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test("should protect routes when not authenticated", async ({ page }) => {
    await page.goto("/transactions");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });
});
