import { test, expect } from "@playwright/test";
import { login } from "./fixtures/helpers";

const isHome = (url: URL) => url.pathname === "/";

test.describe("Authentication", () => {
  test("should sign up new user", async ({ page }) => {
    await page.goto("/signup");

    await page.fill('[name="email"]', `test-${Date.now()}@example.com`);
    await page.fill('[name="password"]', "TestPassword123!");
    await page.fill('[name="confirmPassword"]', "TestPassword123!");

    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(isHome);
    await expect(
      page.getByRole("main").getByRole("heading", { level: 1, name: "Home" })
    ).toBeVisible();
  });

  test("should sign in existing user", async ({ page }) => {
    await page.goto("/login");

    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "TestPassword123!");

    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(isHome);
    await expect(
      page.getByRole("main").getByRole("heading", { level: 1, name: "Home" })
    ).toBeVisible();
  });

  test("should sign out", async ({ page, isMobile }) => {
    await login(page);

    // On phones, sign out lives in the navigation drawer
    if (isMobile) await page.getByRole("button", { name: "Open navigation menu" }).click();
    await page.getByRole("button", { name: "Sign Out" }).click();

    await expect(page).toHaveURL(/\/login/);
  });

  test("should protect routes when not authenticated", async ({ page }) => {
    await page.goto("/settings");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });
});
