import { test, expect } from "@playwright/test";

test.describe("Offline Mode", () => {
  test("should create transaction offline and sync when online", async ({ page, context }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');

    await page.goto("/transactions");

    // Go offline
    await context.setOffline(true);

    // Verify offline indicator
    await expect(page.getByText(/offline/i)).toBeVisible();

    // Create transaction offline
    await page.click("text=Add Transaction");
    await page.fill('[name="description"]', "Offline Transaction");
    await page.fill('[name="amount"]', "500");
    await page.selectOption('[name="type"]', "expense");
    await page.click('button[type="submit"]');

    // Verify queued
    await expect(page.getByText("Offline Transaction")).toBeVisible();
    await expect(page.getByText(/pending sync/i)).toBeVisible();

    // Go online
    await context.setOffline(false);

    // Wait for sync
    await page.waitForSelector('[data-testid="sync-complete"]', { timeout: 5000 });

    // Verify synced
    await expect(page.getByText(/pending sync/i)).not.toBeVisible();
  });

  test("should load cached data when offline", async ({ page, context }) => {
    // Load page online first
    await page.goto("/transactions");
    await page.waitForLoadState("networkidle");

    // Go offline
    await context.setOffline(true);

    // Reload
    await page.reload();

    // Should still load
    await expect(page.getByText(/transactions/i)).toBeVisible();
  });
});
