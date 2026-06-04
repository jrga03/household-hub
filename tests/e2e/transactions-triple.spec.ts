import { test, expect } from "@playwright/test";
import { login } from "./fixtures/helpers";

test.describe("Transactions triple layout", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("ultrawide shows filters left and detail summary right", async ({ page }) => {
    await page.setViewportSize({ width: 2200, height: 1200 });
    await page.goto("/transactions");
    await expect(page.locator("aside[data-slot='left-aside']")).toBeVisible();
    await expect(page.locator("aside[data-slot='right-aside']")).toBeVisible();
    // Default state with no row selected: right pane shows filter summary.
    await expect(page.locator("aside[data-slot='right-aside']")).toContainText(/filter summary/i);
  });

  test("mid width keeps filters left, hides detail pane", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/transactions");
    await expect(page.locator("aside[data-slot='left-aside']")).toBeVisible();
    await expect(page.locator("aside[data-slot='right-aside']")).toBeHidden();
  });

  test("narrow width hides both asides; filter sheet trigger appears", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.goto("/transactions");
    await expect(page.locator("aside[data-slot='left-aside']")).toBeHidden();
    await expect(page.locator("aside[data-slot='right-aside']")).toBeHidden();
    await expect(page.getByRole("button", { name: /filters/i })).toBeVisible();
  });
});
