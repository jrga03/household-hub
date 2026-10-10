import { test, expect } from "@playwright/test";
import { login } from "./fixtures/helpers";
import { VIEWPORTS } from "./fixtures/viewports";

const ROUTES = [
  { path: "/", name: "home" },
  { path: "/settings", name: "settings" },
];

for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
  test.describe(`Layout baselines — ${vpName} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: vp });

    test.beforeEach(async ({ page }) => {
      await login(page);
    });

    for (const route of ROUTES) {
      test(`${route.name} renders`, async ({ page }) => {
        await page.goto(route.path);
        // Page-content h1 lives inside <main id="main-content">; the layout has
        // a separate mobile-only h1 in the sidebar that may be hidden.
        await expect(page.locator("#main-content h1").first()).toBeVisible();
        await expect(page).toHaveScreenshot(`${route.name}-${vpName}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.02,
        });
      });
    }
  });
}
