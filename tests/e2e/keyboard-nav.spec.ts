import { test, expect } from "@playwright/test";

test.describe("Keyboard Navigation", () => {
  test("should navigate main menu with keyboard only", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');

    await page.goto("/");

    // Tab through main navigation
    await page.keyboard.press("Tab");
    const firstNav = await page.evaluate(() => document.activeElement?.getAttribute("data-nav"));
    expect(firstNav).toBeTruthy();

    await page.keyboard.press("Tab");
    const secondNav = await page.evaluate(() => document.activeElement?.getAttribute("data-nav"));
    expect(secondNav).toBeTruthy();

    // Verify we can navigate with keyboard
    expect(firstNav).not.toBe(secondNav);
  });
});
