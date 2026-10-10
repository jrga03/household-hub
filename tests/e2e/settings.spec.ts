import { test, expect } from "@playwright/test";
import { login } from "./fixtures/helpers";

test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/settings");
  });

  test("settings page renders the appearance section", async ({ page }) => {
    await expect(
      page.getByRole("main").getByRole("heading", { level: 1, name: "Settings" })
    ).toBeVisible();
    await expect(page.getByText("Choose how Household Hub looks to you")).toBeVisible();
  });

  test("switching to dark theme applies the dark class", async ({ page }) => {
    await page.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.getByRole("button", { name: "Light" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });
});
