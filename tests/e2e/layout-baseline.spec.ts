import { test, expect, type ViewportSize } from "@playwright/test";
import { login } from "./fixtures/helpers";
import { DARK_VIEWPORTS, VIEWPORTS } from "./fixtures/viewports";

const ROUTES = [
  { path: "/", name: "home" },
  { path: "/accounts", name: "accounts" },
  { path: "/settings", name: "settings" },
  { path: "/transactions", name: "transactions" },
  { path: "/budget", name: "budget" },
  { path: "/plan", name: "plan" },
  { path: "/review", name: "review" },
];

const withScheme = (viewports: Record<string, ViewportSize>, colorScheme: "light" | "dark") =>
  Object.entries(viewports).map(([vpName, vp]) => ({ vpName, vp, colorScheme }));

const RUNS = [...withScheme(VIEWPORTS, "light"), ...withScheme(DARK_VIEWPORTS, "dark")];

for (const { vpName, vp, colorScheme } of RUNS) {
  const variantName = colorScheme === "dark" ? `${vpName}-dark` : vpName;

  test.describe(`Layout baselines — ${variantName} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: vp, colorScheme });

    test.beforeEach(async ({ page }) => {
      await login(page);
    });

    for (const route of ROUTES) {
      test(`${route.name} renders`, async ({ page }) => {
        await page.goto(route.path);
        // The page title is the shell header's h1
        await expect(page.getByRole("banner").getByRole("heading", { level: 1 })).toBeVisible();
        const isPhone = vpName === "phone";
        if (isPhone) {
          // fullPage capture drops touch emulation on Mobile Chrome, so it renders
          // without the coarse-pointer touch targets and masks land off target.
          // Measure after server data (members, join requests) has rendered.
          await page.waitForLoadState("networkidle");
          const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
          await page.setViewportSize({ width: vp.width, height: Math.max(vp.height, pageHeight) });
        }
        await expect(page).toHaveScreenshot(`${route.name}-${variantName}.png`, {
          fullPage: !isPhone,
          maxDiffPixelRatio: 0.02,
          // The Household Code differs on every database; the month changes monthly
          mask: [
            page.getByTestId("household-code"),
            page.getByTestId("finances-month"),
            page.getByRole("group", { name: "Month" }),
          ],
        });
      });
    }
  });
}
