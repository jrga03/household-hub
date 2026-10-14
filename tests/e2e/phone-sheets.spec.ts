import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { chooseOption, navigateTo, signUpNewPerson } from "./fixtures/helpers";

/** An iPhone keyboard with its suggestion bar, in CSS px. */
const KEYBOARD_HEIGHT = 336;

/**
 * iOS Safari lays the keyboard over the page: only the visual viewport
 * shrinks. It may also pan the visual viewport down the page (`offsetTop`)
 * to bring the focused field above the keyboard. Browsers can't show a soft
 * keyboard under automation, so this fakes both numbers the same way.
 */
async function emulateOverlayKeyboard(page: Page) {
  await page.addInitScript(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const prototype = Object.getPrototypeOf(viewport) as object;
    const heightOf = Object.getOwnPropertyDescriptor(prototype, "height");
    const offsetTopOf = Object.getOwnPropertyDescriptor(prototype, "offsetTop");
    let covered = 0;
    let panned = 0;
    Object.defineProperty(viewport, "height", {
      configurable: true,
      get: () => (heightOf?.get?.call(viewport) as number) - covered,
    });
    Object.defineProperty(viewport, "offsetTop", {
      configurable: true,
      get: () => (offsetTopOf?.get?.call(viewport) as number) + panned,
    });
    Object.assign(window, {
      setKeyboard: (height: number, pan: number) => {
        covered = height;
        panned = pan;
        viewport.dispatchEvent(new window.Event("resize"));
        viewport.dispatchEvent(new window.Event("scroll"));
      },
    });
  });
}

/** `pan`: how far iOS scrolled the visible area down the page to show the focused field. */
const setKeyboard = (page: Page, height: number, pan = 0) =>
  page.evaluate(
    ([h, p]) =>
      (window as unknown as { setKeyboard: (h: number, p: number) => void }).setKeyboard(h, p),
    [height, pan] as const
  );

interface Band {
  top: number;
  bottom: number;
}

/** The part of the page the person sees, in page coordinates. */
const visibleBand = (page: Page): Promise<Band> =>
  page.evaluate(() => {
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    return { top, bottom: top + (viewport?.height ?? window.innerHeight) };
  });

async function expectInBand(element: Locator, band: Band) {
  const box = await element.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  expect(box.y).toBeGreaterThanOrEqual(band.top - 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(band.bottom + 0.5);
}

const expectAboveKeyboard = (element: Locator, visibleHeight: number) =>
  expectInBand(element, { top: 0, bottom: visibleHeight });

const sheetBody = (sheet: Locator) => sheet.locator("form").locator("..");

const scrollBodyTo = (sheet: Locator, edge: "top" | "bottom") =>
  sheetBody(sheet).evaluate((element, to) => {
    element.scrollTop = to === "top" ? 0 : element.scrollHeight;
  }, edge);

async function openAddTransaction(page: Page, slot = "drawer-content", accountName = "BPI") {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Sheet home");
  await page.getByRole("button", { name: "Create household" }).click();
  await navigateTo(page, "Accounts");
  const addAccount = page.getByRole("form", { name: "Add an account" });
  await addAccount.getByLabel("Account name").fill(accountName);
  await addAccount.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("list", { name: "Accounts" })).toContainText(accountName);

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

/**
 * Saves a screenshot to the test's output folder. With a band, the parts of
 * the page outside it (under the keyboard, or panned off the top) are shaded.
 */
async function shoot(page: Page, sheet: Locator, name: string, band?: Band) {
  await expect(sheet).toBeVisible();
  await settle(page);
  if (band) {
    await page.evaluate(({ top, bottom }) => {
      const shaded: [number, number][] = [
        [0, top],
        [bottom, window.innerHeight],
      ];
      for (const [from, to] of shaded) {
        if (to <= from) continue;
        const shade = document.createElement("div");
        shade.dataset.testShade = "";
        Object.assign(shade.style, {
          position: "fixed",
          left: "0",
          right: "0",
          top: `${from}px`,
          height: `${to - from}px`,
          background: "rgba(255, 0, 128, 0.35)",
          zIndex: "2147483647",
          pointerEvents: "none",
        });
        document.body.append(shade);
      }
    }, band);
  }
  await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
  await page.evaluate(() =>
    document.querySelectorAll("[data-test-shade]").forEach((shade) => shade.remove())
  );
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
    await expect(sheet.getByLabel("Description", { exact: true })).toBeFocused();
    await page.keyboard.type("Lunch");
    await page.keyboard.press("Enter");
    await expect(sheet.getByLabel("Notes (optional)")).toBeFocused();
    await expect(sheet).toBeVisible();
  });

  // iOS either lays the keyboard over the sheet, or pans the page up so the sheet's bottom shows.
  for (const { name, pan } of [
    { name: "laid over the page", pan: 0 },
    { name: "with the page panned up", pan: KEYBOARD_HEIGHT },
  ]) {
    test(`every field scrolls into view above an iOS keyboard ${name}`, async ({ page }) => {
      await emulateOverlayKeyboard(page);
      const sheet = await openAddTransaction(page);
      const amount = sheet.getByLabel("Amount (₱)");
      await expect(amount).toBeFocused();
      await shoot(page, sheet, "no-keyboard");

      await setKeyboard(page, KEYBOARD_HEIGHT, pan);
      const band = await visibleBand(page);

      await scrollBodyTo(sheet, "top");
      // Soft, so the screenshots still show where each edge ended up.
      await expect.soft(() => expectInBand(amount, band)).toPass({ timeout: 3_000 });
      await shoot(page, sheet, `keyboard-${pan ? "panned" : "overlay"}-top`, band);

      await scrollBodyTo(sheet, "bottom");
      await expect
        .soft(async () => {
          await expectInBand(sheet.getByRole("radio", { name: "Pending" }), band);
          await expectInBand(sheet.getByRole("button", { name: "Add transaction" }), band);
        })
        .toPass({ timeout: 3_000 });
      await shoot(page, sheet, `keyboard-${pan ? "panned" : "overlay"}-bottom`, band);
    });
  }

  test("the buttons follow the last field instead of staying pinned", async ({ page }) => {
    await emulateOverlayKeyboard(page);
    const sheet = await openAddTransaction(page);
    await setKeyboard(page, KEYBOARD_HEIGHT);
    const band = await visibleBand(page);

    await scrollBodyTo(sheet, "top");

    await expect(async () => {
      const submit = await sheet.getByRole("button", { name: "Add transaction" }).boundingBox();
      const status = await sheet.getByRole("radio", { name: "Pending" }).boundingBox();
      expect(submit && status && submit.y > status.y + status.height).toBe(true);
      expect(submit && submit.y >= band.bottom).toBe(true);
    }).toPass({ timeout: 5_000 });
  });

  test("no sideways scroll at 320 px, even with a date field as wide as iOS draws it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const sheet = await openAddTransaction(
      page,
      "drawer-content",
      "BPI Family Savings for the Household"
    );
    // WebKit draws a date field as a flex box around its value; iOS makes that value wide.
    await page.addStyleTag({
      content: `
        :where(input[type="date"]) { display: inline-flex; }
        :where(input[type="date"])::-webkit-datetime-edit { flex: none; min-width: 400px; }
        :where(input[type="date"])::-webkit-date-and-time-value { flex: none; min-width: 400px; }
      `,
    });

    const body = sheetBody(sheet);
    const widths = await body.evaluate((element) => ({
      scroll: element.scrollWidth,
      client: element.clientWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
    await shoot(page, sheet, "320-wide-date");
  });

  // iOS keeps a natively drawn date field at its own minimum width, whatever its CSS width; only
  // `appearance: none` makes it honour the column. Emulators don't draw it that way, so check the cause.
  test("date fields drop the native look so iOS sizes them to the form", async ({ page }) => {
    const sheet = await openAddTransaction(page);
    const date = sheet.locator('input[type="date"]');
    await expect(date).toHaveCSS("appearance", "none");
  });

  test("the transaction sheet's header is its title alone", async ({ page }) => {
    const sheet = await openAddTransaction(page);
    await expect(sheet).not.toContainText("Saved on this device");
  });

  test("the transfer sheet's header is its title alone", async ({ page }) => {
    const sheet = await openAddTransaction(page);
    await sheet.getByRole("button", { name: "Close" }).click();
    const addAccount = page.getByRole("form", { name: "Add an account" });
    await addAccount.getByLabel("Account name").fill("GCash");
    await addAccount.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByRole("list", { name: "Accounts" })).toContainText("GCash");

    await page.getByRole("button", { name: "Add transaction" }).click();
    const add = page.getByRole("dialog", { name: "Add transaction" });
    await add.getByLabel("Amount (₱)").fill("500");
    await add.getByRole("radio", { name: "Transfer" }).click();
    await chooseOption(page, add.getByLabel("From"), "BPI");
    await chooseOption(page, add.getByLabel("To"), "GCash");
    await add.getByLabel("Description (optional)").fill("Top up");
    await add.getByRole("button", { name: "Add transfer" }).click();
    await expect(add).toBeHidden();

    await navigateTo(page, "Transactions");
    await page
      .getByRole("button", { name: /^Edit Top up/ })
      .first()
      .click();
    const edit = page.getByRole("dialog", { name: "Edit transfer" });
    await expect(edit).toBeVisible();
    await expect(edit).not.toContainText("Saved on this device");
  });

  test("Remove sits below Save as a plain destructive text button", async ({ page }) => {
    const sheet = await openAddTransaction(page);
    await sheet.getByLabel("Amount (₱)").fill("250");
    await sheet.getByLabel("Description", { exact: true }).fill("Market");
    await sheet.getByRole("button", { name: "Add transaction" }).click();
    await expect(sheet).toBeHidden();

    await navigateTo(page, "Transactions");
    await page.getByRole("button", { name: "Edit Market" }).click();
    const edit = page.getByRole("dialog", { name: "Edit transaction" });
    await scrollBodyTo(edit, "bottom");
    const remove = edit.getByRole("button", { name: "Remove" });

    // Measured together, so the sheet sliding in can't skew the gap.
    await expect(async () => {
      const gap = await edit.evaluate((sheet) => {
        const [saveTop, removeTop] = ["Save", "Remove"].map((name) =>
          [...sheet.querySelectorAll("button")]
            .find((button) => button.textContent?.trim() === name)
            ?.getBoundingClientRect()
        );
        return saveTop && removeTop ? removeTop.top - saveTop.bottom : null;
      });
      expect(gap).toBeGreaterThanOrEqual(16);
    }).toPass({ timeout: 5_000 });
    const look = await remove.evaluate((button) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--destructive)";
      document.body.append(probe);
      const destructive = window.getComputedStyle(probe).color;
      probe.remove();
      const style = window.getComputedStyle(button);
      return {
        color: style.color,
        destructive,
        background: style.backgroundColor,
        border: style.borderTopWidth,
      };
    });
    expect(look.color).toBe(look.destructive);
    expect(look.background).toBe("rgba(0, 0, 0, 0)");
    expect(look.border).toBe("0px");
    await shoot(page, edit, "edit-remove");
  });

  test("the sheet stays above a keyboard that resizes the page (Android)", async ({ page }) => {
    const sheet = await openAddTransaction(page);
    const description = sheet.getByLabel("Description", { exact: true });
    await description.focus();

    // interactive-widget=resizes-content: the keyboard shrinks the layout viewport itself.
    const size = page.viewportSize();
    if (!size) throw new Error("no viewport");
    const visibleHeight = size.height - KEYBOARD_HEIGHT;
    await page.setViewportSize({ width: size.width, height: visibleHeight });

    await expect(() => expectAboveKeyboard(description, visibleHeight)).toPass({ timeout: 5_000 });
    await scrollBodyTo(sheet, "top");
    await expect(() => expectAboveKeyboard(sheet.getByLabel("Amount (₱)"), visibleHeight)).toPass({
      timeout: 5_000,
    });
    await scrollBodyTo(sheet, "bottom");
    const submit = sheet.getByRole("button", { name: "Add transaction" });
    await expect(() => expectAboveKeyboard(submit, visibleHeight)).toPass({ timeout: 5_000 });
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
    const body = sheetBody(sheet);
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
    // A description is required, so the form waits for one.
    await expect(dialog.getByLabel("Description", { exact: true })).toBeFocused();
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Description", { exact: true }).fill("Lunch");
    await dialog.getByLabel("Amount (₱)").press("Enter");
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Transaction added")).toBeVisible();
  });
});
