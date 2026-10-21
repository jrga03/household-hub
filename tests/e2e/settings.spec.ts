import { test, expect } from "@playwright/test";
import { login, openSettingsSection } from "./fixtures/helpers";

test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/settings");
  });

  test("settings page renders the appearance section", async ({ page }) => {
    await expect(
      page.getByRole("banner").getByRole("heading", { level: 1, name: "Settings" })
    ).toBeVisible();
    const appearance = await openSettingsSection(page, "Appearance");
    await expect(appearance).toContainText("Choose how Household Hub looks to you.");
    await expect(appearance.getByRole("radiogroup", { name: "Theme" })).toBeVisible();
  });

  test("switching to dark theme applies the dark class", async ({ page }) => {
    const appearance = await openSettingsSection(page, "Appearance");
    await appearance.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await appearance.getByRole("radio", { name: "Light" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("a section opens beside the list from 840, or jumps into view on a phone", async ({
    page,
  }) => {
    const members = await openSettingsSection(page, "Members");
    await expect(members.getByRole("list", { name: "Members" })).toContainText("test@example.com");
    await expect(members).toBeInViewport();
    const twoPanes = await page.getByRole("list", { name: "Settings sections" }).isVisible();
    await expect(page).toHaveURL(twoPanes ? /\?open=members$/ : /#members$/);
  });
});
