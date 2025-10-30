import { test, expect } from "@playwright/test";

test.describe("Performance", () => {
  test("should handle 10k transactions", async ({ page }) => {
    // Seed 10k transactions (via API or fixture)
    await page.request.post("/api/seed-transactions", {
      data: { count: 10000 },
    });

    await page.goto("/transactions");

    // Should load within 3s
    await page.waitForSelector('[data-testid="transaction-row"]', { timeout: 3000 });

    // Virtual scrolling should work
    const visibleRows = await page.locator('[data-testid="transaction-row"]').count();
    expect(visibleRows).toBeLessThan(100); // Should virtualize

    // Scroll should be smooth
    await page.evaluate(() => window.scrollTo(0, 10000));
    await page.waitForTimeout(100);

    // More rows should be visible after scroll
    const visibleAfterScroll = await page.locator('[data-testid="transaction-row"]').count();
    expect(visibleAfterScroll).toBeGreaterThan(0);
  });

  test("should have acceptable bundle size", async ({ page }) => {
    await page.goto("/");

    const resources = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .filter((r) => r.name.includes(".js"))
        .reduce((sum, r) => {
          // eslint-disable-next-line no-undef
          const resource = r as PerformanceResourceTiming;
          return sum + resource.transferSize;
        }, 0)
    );

    // Should be under 200KB
    expect(resources).toBeLessThan(200 * 1024);
  });
});
