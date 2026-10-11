import { test, expect } from "@playwright/test";
import { signUpNewPerson } from "./fixtures/helpers";

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

  test("should show offline indicator when offline", async ({ page, context }) => {
    await signUpNewPerson(page);
    await page.getByLabel("Household name").fill("PWA home");
    await page.getByRole("button", { name: "Create household" }).click();
    const syncStatus = page.getByRole("button", { name: /^Sync status:/ });
    await expect(syncStatus).toHaveAccessibleName("Sync status: Synced");

    await context.setOffline(true);
    await expect(syncStatus).toHaveAccessibleName("Sync status: Offline");

    await context.setOffline(false);
    await expect(syncStatus).toHaveAccessibleName("Sync status: Synced");
  });
});
