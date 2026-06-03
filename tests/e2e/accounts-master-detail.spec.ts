import { test, expect } from "@playwright/test";
import { login } from "./fixtures/helpers";

test.describe("Accounts master-detail", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("selecting an account updates URL and detail pane", async ({ page }) => {
    await page.goto("/accounts");
    // Scope to the main column to ignore sidebar buttons (Add Account, etc.)
    const firstAccount = page.locator("[data-slot='main'] button[aria-pressed]").first();
    await firstAccount.waitFor();
    const name = (await firstAccount.locator(".font-medium").textContent())?.trim() ?? "";
    expect(name).not.toBe("");
    await firstAccount.click();
    await expect(page).toHaveURL(/selected=/);
    await expect(page.locator("aside[data-slot='right-aside']")).toContainText(name);
  });

  test("selection survives reload", async ({ page }) => {
    await page.goto("/accounts");
    const firstAccount = page.locator("[data-slot='main'] button[aria-pressed]").first();
    await firstAccount.waitFor();
    await firstAccount.click();
    const url = page.url();
    await page.reload();
    await expect(page).toHaveURL(url);
    await expect(page.locator("[data-slot='main'] button[aria-pressed='true']")).toBeVisible();
  });
});
