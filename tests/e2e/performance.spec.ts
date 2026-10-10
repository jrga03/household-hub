import { test, expect } from "@playwright/test";

test.describe("Performance", () => {
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
