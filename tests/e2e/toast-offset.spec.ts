import { test, expect, type Locator, type Page } from "@playwright/test";
import { login, navigateTo, openSettingsSection } from "./fixtures/helpers";
import { VIEWPORTS } from "./fixtures/viewports";

test.use({ viewport: VIEWPORTS.compact, hasTouch: true, isMobile: true });

async function edges(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("not on screen");
  return { top: box.y, bottom: box.y + box.height };
}

/** Copies the Household Code on Settings (its toast says copied or failed; either will do) and waits for it to slide in. */
async function showToast(page: Page) {
  await navigateTo(page, "Settings");
  const household = await openSettingsSection(page, "Household");
  await household.getByRole("button", { name: /copy/i }).click();
  const toast = page.locator("[data-sonner-toast]").first();
  await expect(toast).toHaveAttribute("data-mounted", "true");
  await toast.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished))
  );
  return toast;
}

test.describe("phone toasts", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("sit just above the tab bar on a page without the floating Add button", async ({ page }) => {
    const toast = await showToast(page);

    const tabBar = await edges(page.getByRole("navigation", { name: "Primary navigation" }));
    expect(tabBar.top - (await edges(toast)).bottom).toBeLessThanOrEqual(40);
  });

  test("rise above the floating Add button on a page that shows it", async ({ page }) => {
    const toast = await showToast(page);
    await navigateTo(page, "Home");

    const addButton = await edges(page.getByRole("button", { name: "Add transaction" }));
    await expect.poll(async () => (await edges(toast)).bottom).toBeLessThan(addButton.top);
  });
});
