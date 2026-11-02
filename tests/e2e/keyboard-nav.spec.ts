import { test, expect } from "@playwright/test";
import { login } from "./fixtures/helpers";

test("the main navigation works by keyboard alone", async ({ page, isMobile }) => {
  test.skip(isMobile, "phones navigate by touch, so the tab bar has no keyboard path to test");
  await login(page);
  await expect(page.getByRole("link", { name: /^Home/ })).toBeVisible();

  const focused = page.locator(":focus");
  const focusedText = () => page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
  for (let presses = 0; presses < 10 && !(await focusedText()).startsWith("Home"); presses++) {
    await page.keyboard.press("Tab");
  }
  await expect(focused).toHaveAccessibleName(/^Home/);

  await page.keyboard.press("Tab");
  await expect(focused).toHaveAccessibleName(/^Transactions/);
  await page.keyboard.press("Tab");
  await expect(focused).toHaveAccessibleName(/^Budget/);

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/budget$/);
});
