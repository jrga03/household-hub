import { test, expect, type ViewportSize } from "@playwright/test";
import { login, loginAs } from "./fixtures/helpers";
import { householdlessUser } from "./fixtures/test-users";
import { DARK_VIEWPORTS, VIEWPORTS } from "./fixtures/viewports";

const ROUTES = [
  { path: "/", name: "home" },
  { path: "/accounts", name: "accounts" },
  { path: "/settings", name: "settings" },
  { path: "/transactions", name: "transactions" },
  { path: "/budget", name: "budget" },
  { path: "/plan", name: "plan" },
  { path: "/review", name: "review" },
  { path: "/import", name: "import" },
  // No app chrome: its title is the page's own h1, and only someone without a household sees it.
  { path: "/create-or-join", name: "create-or-join", householdless: true },
];

const withScheme = (viewports: Record<string, ViewportSize>, colorScheme: "light" | "dark") =>
  Object.entries(viewports).map(([vpName, vp]) => ({ vpName, vp, colorScheme }));

const RUNS = [...withScheme(VIEWPORTS, "light"), ...withScheme(DARK_VIEWPORTS, "dark")];

for (const { vpName, vp, colorScheme } of RUNS) {
  const variantName = colorScheme === "dark" ? `${vpName}-dark` : vpName;

  test.describe(`Layout baselines — ${variantName} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: vp, colorScheme });

    for (const route of ROUTES) {
      test(`${route.name} renders`, async ({ page }) => {
        if ("householdless" in route) await loginAs(page, householdlessUser);
        else await login(page);
        await page.goto(route.path);
        // The page title is the shell header's h1
        const title = ("householdless" in route ? page : page.getByRole("banner")).getByRole(
          "heading",
          { level: 1 }
        );
        await expect(title).toBeVisible();
        // Measure after server data has rendered
        await page.waitForLoadState("networkidle");
        if (vpName === "compact") {
          const { scrollWidth, clientWidth } = await title.evaluate((heading) => ({
            scrollWidth: heading.scrollWidth,
            clientWidth: heading.clientWidth,
          }));
          expect(scrollWidth, "the page title is truncated").toBeLessThanOrEqual(clientWidth);
        }
        // Grow the viewport rather than use fullPage: fullPage capture drops touch
        // emulation on Mobile Chrome (masks land off target) and the sidebar stops
        // at the original viewport line.
        const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        await page.setViewportSize({ width: vp.width, height: Math.max(vp.height, pageHeight) });
        await expect(page).toHaveScreenshot(`${route.name}-${variantName}.png`, {
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
