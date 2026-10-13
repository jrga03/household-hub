import { test, expect, type Locator, type Page } from "@playwright/test";
import { signUpNewPerson } from "./fixtures/helpers";

/** An iPhone keyboard with its suggestion bar, in CSS px. */
const KEYBOARD_HEIGHT = 336;

/**
 * iOS Safari lays the keyboard over the page: only the visual viewport
 * shrinks. Browsers can't show a soft keyboard under automation, so this
 * shrinks `visualViewport.height` the same way.
 */
async function emulateOverlayKeyboard(page: Page) {
  await page.addInitScript(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const heightOf = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(viewport), "height");
    let covered = 0;
    Object.defineProperty(viewport, "height", {
      configurable: true,
      get: () => (heightOf?.get?.call(viewport) as number) - covered,
    });
    Object.assign(window, {
      setKeyboard: (height: number) => {
        covered = height;
        viewport.dispatchEvent(new window.Event("resize"));
      },
    });
  });
}

const setKeyboard = (page: Page, height: number) =>
  page.evaluate(
    (h) => (window as unknown as { setKeyboard: (h: number) => void }).setKeyboard(h),
    height
  );

async function expectAboveKeyboard(element: Locator, visibleHeight: number) {
  const box = await element.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(visibleHeight + 0.5);
}

async function openAddTransaction(page: Page) {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Sheet home");
  await page.getByRole("button", { name: "Create household" }).click();
  const addAccount = page.getByRole("form", { name: "Add an account" });
  await addAccount.getByLabel("Account name").fill("BPI");
  await addAccount.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("list", { name: "Accounts" })).toContainText("BPI");

  await page.getByRole("button", { name: "Add transaction" }).click();
  const sheet = page.getByRole("dialog", { name: "Add transaction" });
  await expect(sheet).toHaveAttribute("data-slot", "drawer-content");
  return sheet;
}

test.describe("phone forms", () => {
  test.skip(({ isMobile }) => !isMobile, "bottom sheets are for phones");

  test("Enter moves through the typed fields of a bottom sheet", async ({ page }) => {
    const sheet = await openAddTransaction(page);
    const amount = sheet.getByLabel("Amount (₱)");
    await expect(amount).toHaveAttribute("enterkeyhint", "next");

    await amount.fill("120");
    await amount.press("Enter");
    await expect(sheet.getByLabel("Description (optional)")).toBeFocused();
    await page.keyboard.type("Lunch");
    await page.keyboard.press("Enter");
    await expect(sheet.getByLabel("Notes (optional)")).toBeFocused();
    await expect(sheet).toBeVisible();
  });

  test("the sheet stays above a keyboard laid over the page (iOS)", async ({ page }) => {
    await emulateOverlayKeyboard(page);
    const sheet = await openAddTransaction(page);
    const description = sheet.getByLabel("Description (optional)");
    await description.focus();

    await setKeyboard(page, KEYBOARD_HEIGHT);

    const visibleHeight = (page.viewportSize()?.height ?? 0) - KEYBOARD_HEIGHT;
    const submit = sheet.getByRole("button", { name: "Add transaction" });
    await expect(async () => {
      await expectAboveKeyboard(submit, visibleHeight);
      await expectAboveKeyboard(description, visibleHeight);
      const footer = await sheet.locator("[data-slot=form-footer]").boundingBox();
      const field = await description.boundingBox();
      expect(field && footer && field.y + field.height <= footer.y).toBe(true);
    }).toPass({ timeout: 5_000 });
    await page.screenshot({ path: test.info().outputPath("overlay-keyboard.png") });
  });

  test("the sheet stays above a keyboard that resizes the page (Android)", async ({ page }) => {
    const sheet = await openAddTransaction(page);
    const description = sheet.getByLabel("Description (optional)");
    await description.focus();

    // interactive-widget=resizes-content: the keyboard shrinks the layout viewport itself.
    const size = page.viewportSize();
    if (!size) throw new Error("no viewport");
    const visibleHeight = size.height - KEYBOARD_HEIGHT;
    await page.setViewportSize({ width: size.width, height: visibleHeight });

    const submit = sheet.getByRole("button", { name: "Add transaction" });
    await expect(async () => {
      await expectAboveKeyboard(submit, visibleHeight);
      await expectAboveKeyboard(description, visibleHeight);
    }).toPass({ timeout: 5_000 });
    await page.screenshot({ path: test.info().outputPath("resized-keyboard.png") });
  });
});
