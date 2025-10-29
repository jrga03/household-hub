import { test, expect } from "@playwright/test";

test.describe("PWA Features", () => {
  test("should register service worker", async ({ page }) => {
    await page.goto("/");

    // Wait for service worker registration
    const swRegistered = await page.evaluate(async () => {
      if (!navigator.serviceWorker) return false;

      const registration = await navigator.serviceWorker.ready;
      return registration.active !== null;
    });

    expect(swRegistered).toBe(true);
  });

  test("should work offline after caching", async ({ page, context }) => {
    // First visit to cache resources
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Wait for service worker to finish caching
    await page.waitForTimeout(2000);

    // Go offline
    await context.setOffline(true);

    // Reload page
    await page.reload();

    // App shell should still load from cache
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByRole("heading")).toBeVisible();
  });

  test("should load cached transactions offline", async ({ page, context }) => {
    // Login and load transactions
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');

    await page.goto("/transactions");
    await page.waitForLoadState("networkidle");

    // Wait for data to be cached
    await page.waitForTimeout(1000);

    // Go offline
    await context.setOffline(true);

    // Reload
    await page.reload();

    // Should still see cached transaction list
    await expect(page.getByTestId("transaction-list")).toBeVisible();
  });

  test("should show offline indicator when offline", async ({ page, context }) => {
    await page.goto("/");

    // Go offline
    await context.setOffline(true);

    // Offline indicator should appear
    await expect(page.getByTestId("offline-indicator")).toBeVisible();

    // Go back online
    await context.setOffline(false);

    // Offline indicator should disappear
    await expect(page.getByTestId("offline-indicator")).not.toBeVisible({ timeout: 3000 });
  });
});
