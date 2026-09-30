import { test, expect } from "@playwright/test";
import { login } from "./fixtures/helpers";

// The dashboard lives at "/"; /dashboard is a legacy redirect
const isDashboard = (url: URL) => url.pathname === "/";

test.describe("Authentication", () => {
  test("should sign up new user", async ({ page }) => {
    await page.goto("/signup");

    await page.fill('[name="email"]', `test-${Date.now()}@example.com`);
    await page.fill('[name="password"]', "TestPassword123!");
    await page.fill('[name="confirmPassword"]', "TestPassword123!");

    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(isDashboard);
    await expect(
      page.getByRole("main").getByRole("heading", { level: 1, name: "Dashboard" })
    ).toBeVisible();
  });

  test("should sign in existing user", async ({ page }) => {
    await page.goto("/login");

    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "TestPassword123!");

    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(isDashboard);
  });

  test("should sign out", async ({ page }) => {
    await login(page);

    await page.getByRole("button", { name: "Sign Out" }).click();

    await expect(page).toHaveURL(/\/login/);
  });

  test("should protect routes when not authenticated", async ({ page }) => {
    await page.goto("/transactions");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });
});
