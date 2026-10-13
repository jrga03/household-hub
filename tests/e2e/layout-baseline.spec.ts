import { test, expect } from "@playwright/test";
import { login } from "./fixtures/helpers";
import { VIEWPORTS } from "./fixtures/viewports";

const ROUTES = [
  { path: "/", name: "home" },
  { path: "/accounts", name: "accounts" },
  { path: "/settings", name: "settings" },
  { path: "/transactions", name: "transactions" },
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
        // The page title is the shell header's h1
        await expect(page.getByRole("banner").getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page).toHaveScreenshot(`${route.name}-${vpName}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.02,
          // The Household Code differs on every database; the month changes monthly
          mask: [page.getByTestId("household-code"), page.getByTestId("finances-month")],
        });
      });
    }
  });
}
