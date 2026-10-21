import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login } from "./fixtures/helpers";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

test.describe("Accessibility", () => {
  for (const path of ["/login", "/signup"]) {
    test(`should not have accessibility violations on ${path}`, async ({ page }) => {
      await page.goto(path);

      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

      expect(results.violations).toHaveLength(0);
    });
  }

  for (const path of ["/", "/accounts", "/settings", "/budget"]) {
    test(`should not have accessibility violations on ${path} when signed in`, async ({ page }) => {
      await login(page);
      await page.goto(path);
      await expect(page.getByRole("banner").getByRole("heading", { level: 1 })).toBeVisible();

      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

      expect(results.violations).toHaveLength(0);
    });
  }
});
