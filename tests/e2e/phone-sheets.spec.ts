import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { navigateTo, signUpNewPerson } from "./fixtures/helpers";

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

async function openAddTransaction(page: Page, slot = "drawer-content") {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Sheet home");
  await page.getByRole("button", { name: "Create household" }).click();
  await navigateTo(page, "Accounts");
  const addAccount = page.getByRole("form", { name: "Add an account" });
  await addAccount.getByLabel("Account name").fill("BPI");
  await addAccount.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("list", { name: "Accounts" })).toContainText("BPI");

  await page.getByRole("button", { name: "Add transaction" }).click();
  const sheet = page.getByRole("dialog", { name: "Add transaction" });
  await expect(sheet).toHaveAttribute("data-slot", slot);
  return sheet;
}

/**
 * Drags down from the element's center. Chromium gets real touches through
 * CDP, so the browser's own touch-action and scroll handling run; WebKit has
 * no touch-drag automation, so it gets real mouse pointer events instead.
 */
async function swipeDown(
  page: Page,
  context: BrowserContext,
  browserName: string,
  from: Locator,
  distance: number
) {
  const box = await from.boundingBox();
  if (!box) throw new Error("nothing to swipe");
  const x = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const steps = 12;
  if (browserName === "chromium") {
    const cdp = await context.newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", y: number) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y }],
      });
    await touch("touchStart", startY);
    for (let step = 1; step <= steps; step++) {
      await touch("touchMove", startY + (distance * step) / steps);
    }
    await touch("touchEnd", startY + distance);
    await cdp.detach();
    return;
  }
  await page.mouse.move(x, startY);
  await page.mouse.down();
  await page.mouse.move(x, startY + distance, { steps });
  await page.mouse.up();
}

/** vaul ignores drags for half a second after opening. */
const settle = (page: Page) => page.waitForTimeout(600);

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

  test("the Close button closes a bottom sheet", async ({ page }) => {
    const sheet = await openAddTransaction(page);
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toBeHidden();
  });

  test("swiping the handle down closes the sheet", async ({ page, context, browserName }) => {
    const sheet = await openAddTransaction(page);
    await settle(page);

    await swipeDown(page, context, browserName, sheet.locator("[data-slot=drawer-handle]"), 300);

    await expect(sheet).toBeHidden();
  });

  test("swiping a scrolled sheet body scrolls it; from the top it closes the sheet", async ({
    page,
    context,
    browserName,
  }) => {
    const sheet = await openAddTransaction(page);
    const body = sheet.locator("form").locator("..");
    const scrollTop = () => body.evaluate((element) => element.scrollTop);
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(await scrollTop()).toBeGreaterThan(0);
    await settle(page);

    await swipeDown(page, context, browserName, sheet.getByText("Status", { exact: true }), 150);
    await page.waitForTimeout(300);
    await expect(sheet).toBeVisible();

    await body.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.waitForTimeout(300);
    await swipeDown(page, context, browserName, sheet.getByText("Amount (₱)"), 300);

    await expect(sheet).toBeHidden();
  });
});

test.describe("wide-screen forms", () => {
  test.skip(({ isMobile }) => isMobile, "phones advance with Enter instead");

  test("Enter in a dialog field submits the form", async ({ page }) => {
    const dialog = await openAddTransaction(page, "dialog-content");
    await dialog.getByLabel("Amount (₱)").fill("120");
    await dialog.getByLabel("Amount (₱)").press("Enter");
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Transaction added")).toBeVisible();
  });
});
