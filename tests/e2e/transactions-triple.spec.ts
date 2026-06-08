import { test, expect } from "@playwright/test";
import { login } from "./fixtures/helpers";

test.describe("Transactions triple layout", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("ultrawide shows main + middle detail + right filters; middle shows summary by default", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 2200, height: 1200 });
    await page.goto("/transactions");
    // PageShell `triple` slot mapping (positional fiction):
    //   left-aside  = middle column (detail pane)
    //   right-aside = right column (filter inputs)
    await expect(page.locator("aside[data-slot='left-aside']")).toBeVisible();
    await expect(page.locator("aside[data-slot='right-aside']")).toBeVisible();
    // With no row selected, the middle detail pane renders the filter summary card.
    await expect(page.locator("aside[data-slot='left-aside']")).toContainText(/filter summary/i);
  });

  test("mid width shows filters on the right, hides middle detail pane", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/transactions");
    await expect(page.locator("aside[data-slot='left-aside']")).toBeHidden();
    await expect(page.locator("aside[data-slot='right-aside']")).toBeVisible();
  });

  test("narrow width hides both asides; filter sheet trigger appears", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.goto("/transactions");
    await expect(page.locator("aside[data-slot='left-aside']")).toBeHidden();
    await expect(page.locator("aside[data-slot='right-aside']")).toBeHidden();
    await expect(page.getByRole("button", { name: /filters/i })).toBeVisible();
  });
});
