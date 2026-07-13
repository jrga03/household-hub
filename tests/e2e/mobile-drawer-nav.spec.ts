import { test, expect, type Page } from "@playwright/test";
import { login } from "./fixtures/helpers";

/**
 * Mobile drawer navigation (regression for the dead side menu, 2026-07-13).
 *
 * Every controlled Sheet is history-managed by useHistoryBackClose: opening
 * the drawer pushes a sentinel history entry so hardware back closes it
 * instead of exiting the PWA. A drawer-link tap closes the drawer AND
 * navigates in the same task — and the hook's cleanup used to queue a
 * consuming history.back() BEFORE the router's push landed, so the async
 * traversal executed after it and silently bounced the user off the route
 * they had just navigated to (URL snapped back, menu looked dead; bounced
 * 30/30 in the Chromium repro harness). These specs pin both behaviors:
 * drawer links must navigate and STAY navigated, and hardware back must
 * still close the drawer without leaving the page.
 *
 * Gated on the isMobile fixture (set by the Pixel 5 / iPhone 12 device
 * presets): the hamburger + drawer only render in AppLayout's isMobile
 * branch, and the fixture gate skips desktop projects BEFORE the login
 * cost. On mobile projects the drawer open is a hard assertion — if the
 * hamburger fails to render there, the spec must fail, not skip.
 */

test.describe("Mobile drawer navigation", () => {
  test.skip(({ isMobile }) => !isMobile, "drawer + hamburger render in the mobile layout only");

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  async function openDrawer(page: Page): Promise<void> {
    const hamburger = page.getByRole("button", { name: "Open navigation menu" });
    await expect(hamburger).toBeVisible({ timeout: 10000 });
    await hamburger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  }

  test("drawer link navigates to Settings and stays there (no history snap-back)", async ({
    page,
  }) => {
    await openDrawer(page);

    await page.getByRole("dialog").getByRole("link", { name: "Settings" }).click();
    await page.waitForURL("**/settings");

    // The old bug bounced the URL back within ~5ms of the push via a queued
    // back() traversal; a generous settle window keeps this assertion honest.
    await page.waitForTimeout(1000);
    expect(new URL(page.url()).pathname).toBe("/settings");

    // The drawer closed on navigation
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("hardware back closes the drawer without leaving the page", async ({ page }) => {
    const before = new URL(page.url()).pathname;
    await openDrawer(page);

    // Give the sentinel push a moment to land, then go back (the hardware/
    // gesture back equivalent): the drawer must close and the route must not
    // change.
    await page.waitForTimeout(300);
    await page.goBack();

    await expect(page.getByRole("dialog")).toBeHidden();
    expect(new URL(page.url()).pathname).toBe(before);
  });
});
