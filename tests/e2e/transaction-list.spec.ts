import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { format } from "date-fns";
import { chooseOption, signUpNewPerson, navigateTo, transactionRows } from "./fixtures/helpers";

interface Entry {
  amount: string;
  description: string;
  category?: string;
  income?: boolean;
  pending?: boolean;
}

async function addTransaction(page: Page, entry: Entry) {
  await page.keyboard.press("n");
  const dialog = page.getByRole("dialog", { name: "Add transaction" });
  await dialog.getByLabel("Amount (₱)").fill(entry.amount);
  if (entry.income) await dialog.getByRole("radio", { name: "Income" }).check();
  if (entry.category) await chooseOption(page, dialog.getByLabel("Category"), entry.category);
  await dialog.getByLabel("Description", { exact: true }).fill(entry.description);
  if (entry.pending) await dialog.getByRole("radio", { name: "Pending" }).check();
  await dialog.getByRole("button", { name: "Add transaction" }).click();
  await expect(dialog).toBeHidden();
}

async function startHousehold(page: Page) {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("List home");
  await page.getByRole("button", { name: "Create household" }).click();
  await navigateTo(page, "Accounts");

  const addAccount = page.getByRole("form", { name: "Add an account" });
  await addAccount.getByLabel("Account name").fill("BPI");
  await addAccount.getByLabel("Starting balance (₱)").fill("10000");
  await addAccount.getByRole("button", { name: "Add account" }).click();
}

/** Real touches through CDP, so the browser's own touch-action and scroll handling run (Chromium only). */
async function touch(page: Page, context: BrowserContext, target: Locator, dx: number, holdMs = 0) {
  const box = await target.boundingBox();
  if (!box) throw new Error("nothing to touch");
  const y = box.y + box.height / 2;
  const startX = box.x + box.width / 2;
  const cdp = await context.newCDPSession(page);
  const send = (type: "touchStart" | "touchMove" | "touchEnd", x: number) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y }],
    });
  await send("touchStart", startX);
  if (holdMs > 0) await page.waitForTimeout(holdMs);
  const steps = 10;
  for (let step = 1; step <= steps && dx !== 0; step++) {
    await send("touchMove", startX + (dx * step) / steps);
  }
  await send("touchEnd", startX + dx);
  await cdp.detach();
}

test("filters combine, and the search follows them", async ({ page, isMobile }) => {
  await startHousehold(page);

  await navigateTo(page, "Categories");
  await page.getByRole("button", { name: "Use suggested categories" }).click();
  await expect(page.getByRole("list", { name: "Food categories" })).toContainText("Groceries");

  await navigateTo(page, "Transactions");
  await addTransaction(page, { amount: "250", description: "Market", category: "Groceries" });
  await addTransaction(page, { amount: "120.50", description: "Bakery", category: "Groceries" });
  await addTransaction(page, { amount: "250", description: "Dinner", category: "Restaurants" });
  await addTransaction(page, { amount: "1000", description: "Salary", income: true });
  await addTransaction(page, { amount: "80", description: "Parking" });

  const rows = transactionRows(page);
  const filters = page.getByRole("search", { name: "Filter transactions" });
  await expect(rows).toHaveCount(5);
  await expect(page.getByRole("region", { name: "Totals" })).toHaveCount(0);

  await chooseOption(
    page,
    filters.getByLabel("Month", { exact: true }),
    format(new Date(), "MMMM yyyy")
  );
  await chooseOption(page, filters.getByLabel("Category", { exact: true }), "Groceries");
  await expect(rows).toHaveCount(2);

  await filters.getByRole("button", { name: "Clear filters" }).click();
  const search = filters.getByLabel("Search description, notes or amount");
  await search.pressSequentially("250");
  await expect(search).toHaveValue("250");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Market" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Dinner" })).toHaveCount(1);

  await search.fill("");
  // A chip on phones, a switch in the laptop's filter rail.
  await filters.getByRole(isMobile ? "button" : "switch", { name: "Needs a category" }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("Parking");
});

test("rows sit under their date with its net, and a pending one is marked by an icon", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 851 });
  await startHousehold(page);
  await navigateTo(page, "Transactions");
  await addTransaction(page, { amount: "250", description: "Lunch", pending: true });
  await addTransaction(page, { amount: "1000", description: "Salary", income: true });

  const list = page.getByRole("list", { name: "Transactions" });
  const today = list.getByRole("heading", { name: "Today" });
  await expect(today).toBeVisible();
  // The day's net: income less expenses, signed.
  await expect(today.locator("..")).toContainText("+₱750.00");
  const lunch = list.getByRole("listitem").filter({ hasText: "Lunch" });
  // An expense reads with a minus sign and is announced as minus.
  await expect(lunch).toContainText("−₱250.00");
  await expect(
    lunch.getByRole("button", {
      name: "Pending Lunch minus ₱250.00 Unassigned · BPI",
      exact: true,
    })
  ).toBeVisible();
  await expect(lunch).toContainText("Unassigned · BPI");
  await expect(lunch.getByRole("img", { name: "Pending" })).toBeVisible();
  const salary = list.getByRole("listitem").filter({ hasText: "Salary" });
  await expect(salary).toContainText("+₱1,000.00");
  await expect(salary).not.toContainText("−");
  await expect(salary.getByRole("img", { name: "Pending" })).toHaveCount(0);
  await expect(list.getByRole("checkbox")).toHaveCount(0);
  await expect(list.getByRole("button", { name: /^Mark/ })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("list-393.png") });
});

test("the last row stays inside the list's bottom border", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 851 });
  await startHousehold(page);
  await navigateTo(page, "Transactions");
  await addTransaction(page, { amount: "250", description: "Lunch" });
  await addTransaction(page, { amount: "80", description: "Parking" });

  const list = page.getByRole("list", { name: "Transactions" });
  // Newest first, so the first one added is the last row.
  const lastRow = list.getByRole("listitem").filter({ hasText: "Lunch" });
  await expect(lastRow).toBeVisible();
  const rowBox = await lastRow.boundingBox();
  const bottomBorderInnerEdge = await list.evaluate(
    (element) =>
      element.getBoundingClientRect().bottom -
      parseFloat(window.getComputedStyle(element).borderBottomWidth)
  );
  if (!rowBox) throw new Error("the last row has no box");
  expect(rowBox.y + rowBox.height).toBeLessThanOrEqual(bottomBorderInnerEdge);
});

test("selecting rows changes their category or removes them, with undo", async ({
  page,
  isMobile,
}) => {
  await startHousehold(page);
  await navigateTo(page, "Categories");
  await page.getByRole("button", { name: "Use suggested categories" }).click();
  await expect(page.getByRole("list", { name: "Food categories" })).toContainText("Groceries");
  await navigateTo(page, "Transactions");
  for (const description of ["Water", "Power", "Snack"]) {
    await addTransaction(page, { amount: "100", description });
  }

  const list = page.getByRole("list", { name: "Transactions" });
  const header = page.getByRole("banner");
  const tabBar = page.getByRole("navigation", { name: "Primary navigation" });
  await header.getByRole("button", { name: "Select", exact: true }).click();
  await expect(header.getByRole("heading", { name: "0 selected" })).toBeVisible();
  await list.getByRole("button", { name: /^Water/ }).click();
  await list.getByRole("button", { name: /^Power/ }).click();
  await expect(header.getByRole("heading", { name: "2 selected" })).toBeVisible();
  await expect(list.getByRole("button", { name: /^Power/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  const toolbar = page.getByRole("toolbar", { name: "Selected transactions" });
  await expect(toolbar).toBeVisible();
  if (isMobile) {
    await expect(tabBar).toBeHidden();
    await expect(page.getByRole("button", { name: "Add transaction" })).toBeHidden();
  }

  await chooseOption(page, toolbar.getByLabel("Change category"), "Groceries");
  await expect(page.getByText("Changed the category of 2 transactions")).toBeVisible();
  await expect(toolbar).toBeHidden();
  const water = transactionRows(page).filter({ hasText: "Water" });
  await expect(water).toContainText("Groceries");
  await expect(water.getByRole("button", { name: /^Water/ })).not.toHaveAttribute("aria-pressed");

  await header.getByRole("button", { name: "Select", exact: true }).click();
  await header.getByRole("button", { name: "Select all" }).click();
  await expect(header.getByRole("heading", { name: "3 selected" })).toBeVisible();
  await toolbar.getByRole("button", { name: "Remove" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Remove 3 transactions?" });
  await confirm.getByRole("button", { name: "Remove" }).click();
  await expect(transactionRows(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(transactionRows(page)).toHaveCount(3);

  await header.getByRole("button", { name: "Select", exact: true }).click();
  await header.getByRole("button", { name: "Cancel selection" }).click();
  await expect(toolbar).toBeHidden();
  await expect(header.getByRole("heading", { name: "Transactions" })).toBeVisible();
  if (isMobile) await expect(tabBar).toBeVisible();
});

test("Back and Escape leave selecting without leaving the page", async ({ page }) => {
  await startHousehold(page);
  await navigateTo(page, "Transactions");
  await addTransaction(page, { amount: "100", description: "Water" });

  const header = page.getByRole("banner");
  const selected = header.getByRole("heading", { name: "0 selected" });
  await header.getByRole("button", { name: "Select", exact: true }).click();
  await expect(selected).toBeVisible();
  await page.goBack();
  await expect(header.getByRole("heading", { name: "Transactions" })).toBeVisible();
  await expect(page).toHaveURL(/\/transactions/);

  await header.getByRole("button", { name: "Select", exact: true }).click();
  await expect(selected).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(header.getByRole("heading", { name: "Transactions" })).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Selected transactions" })).toBeHidden();
});

test.describe("on a phone", () => {
  test.skip(
    ({ isMobile, browserName }) => !isMobile || browserName !== "chromium",
    "touch gestures are driven through Chromium's CDP"
  );

  test("a swipe reveals an action that waits for a tap, and a long press selects", async ({
    page,
    context,
  }) => {
    await startHousehold(page);
    await navigateTo(page, "Transactions");
    await addTransaction(page, { amount: "250", description: "Lunch", pending: true });
    await addTransaction(page, { amount: "90", description: "Coffee" });

    const list = page.getByRole("list", { name: "Transactions" });
    const lunch = list.getByRole("listitem").filter({ hasText: "Lunch" });
    const markCleared = lunch.getByRole("button", { name: "Mark cleared" });

    await touch(page, context, lunch, 150);
    await expect(markCleared).toBeVisible();
    await expect(lunch.getByRole("img", { name: "Pending" })).toBeVisible();
    // The list is too short to scroll, so announce one.
    await page.evaluate(() => window.dispatchEvent(new window.Event("scroll")));
    await expect(markCleared).toBeHidden();

    await touch(page, context, lunch, 150);
    await markCleared.click();
    await expect(lunch.getByRole("img", { name: "Pending" })).toHaveCount(0);
    await expect(markCleared).toBeHidden();

    const remove = lunch.getByRole("button", { name: "Remove" });
    await touch(page, context, lunch, -150);
    await expect(remove).toBeVisible();
    await page.getByRole("heading", { name: "Today" }).click();
    await expect(remove).toBeHidden();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await touch(page, context, lunch, -150);
    await remove.click();
    const confirm = page.getByRole("alertdialog", { name: "Remove “Lunch” ₱250.00?" });
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(lunch).toBeVisible();

    const coffee = list.getByRole("listitem").filter({ hasText: "Coffee" });
    await touch(page, context, coffee, 0, 800);
    await expect(
      page.getByRole("banner").getByRole("heading", { name: "1 selected" })
    ).toBeVisible();
    await expect(coffee.getByRole("button", { name: /^Coffee/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("on a wide screen", () => {
  test.use({ viewport: { width: 1600, height: 600 } });

  test("a row opens in the detail pane, Edit opens the form, and the table keeps its place", async ({
    page,
  }) => {
    await startHousehold(page);
    await page.getByRole("link", { name: "Transactions" }).click();
    for (let index = 1; index <= 12; index++) {
      await addTransaction(page, { amount: `${index}00`, description: `Item ${index}` });
    }

    const table = page.getByRole("table", { name: "Transactions" });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const row = table.getByRole("button", { name: "Item 1", exact: true });
    await expect(row).toBeInViewport();
    const scrolledTo = await page.evaluate(() => window.scrollY);
    expect(scrolledTo).toBeGreaterThan(0);
    await row.click();

    const pane = page.getByRole("region", { name: "Item 1" });
    await expect(pane).toContainText("−₱100.00");
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolledTo);

    await pane.getByRole("button", { name: "Edit" }).click();
    const edit = page.getByRole("dialog", { name: "Edit transaction" });
    await edit.getByLabel("Description", { exact: true }).fill("Item one");
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(edit).toBeHidden();
    await expect(page.getByRole("region", { name: "Item one" })).toBeVisible();
    await expect(table.getByRole("button", { name: "Item one", exact: true })).toBeInViewport();
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrolledTo)).toBeLessThan(5);
  });

  test("a quick action changes the row without opening it", async ({ page }) => {
    await startHousehold(page);
    await page.getByRole("link", { name: "Transactions" }).click();
    await addTransaction(page, { amount: "250", description: "Lunch", pending: true });

    const lunch = transactionRows(page).filter({ hasText: "Lunch" });
    await lunch.hover();
    await lunch.getByRole("button", { name: "Mark Lunch cleared" }).click();
    await expect(lunch).toContainText("Cleared");
    await expect(page).not.toHaveURL(/[?&]open=/);
    await expect(page.getByRole("complementary")).toHaveCount(0);
  });

  test("the filter rail folds into a Filters button while a row is open", async ({ page }) => {
    await startHousehold(page);
    await page.getByRole("link", { name: "Transactions" }).click();
    await addTransaction(page, { amount: "250", description: "Lunch" });

    const rail = page.getByRole("search", { name: "Filter transactions" });
    await expect(rail).toBeVisible();
    await transactionRows(page).getByRole("button", { name: "Lunch", exact: true }).click();
    await expect(page.getByRole("region", { name: "Lunch" })).toBeVisible();
    await expect(rail).toBeHidden();
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await expect(rail).toBeVisible();
    await page.keyboard.press("Escape");

    await page
      .getByRole("region", { name: "Lunch" })
      .getByRole("button", { name: "Close" })
      .click();
    await expect(rail).toBeVisible();
    await expect(page.getByRole("button", { name: "Filters", exact: true })).toHaveCount(0);
  });
});

test.describe("a transfer's route", () => {
  for (const width of [1024, 1366]) {
    test(`is never truncated in the table at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 768 });
      await startHousehold(page);
      await expect(page.getByRole("list", { name: "Accounts" })).toContainText("BPI");
      const addAccount = page.getByRole("form", { name: "Add an account" });
      await addAccount.getByLabel("Account name").fill("Metrobank Savings for the Holidays");
      await addAccount.getByLabel("Starting balance (₱)").fill("0");
      await addAccount.getByRole("button", { name: "Add account" }).click();
      await expect(
        page.getByRole("list", { name: "Accounts" }).getByText("Metrobank Savings for the Holidays")
      ).toBeVisible();

      await page.getByRole("button", { name: "Add transaction" }).click();
      const dialog = page.getByRole("dialog", { name: "Add transaction" });
      await dialog.getByLabel("Amount (₱)").fill("2000");
      await dialog.getByRole("radio", { name: "Transfer" }).click();
      await chooseOption(page, dialog.getByLabel("From"), "BPI");
      await chooseOption(page, dialog.getByLabel("To"), "Metrobank Savings for the Holidays");
      await dialog.getByRole("button", { name: "Add transfer" }).click();
      await expect(dialog).toBeHidden();

      await navigateTo(page, "Transactions");
      const route = transactionRows(page).getByRole("cell", {
        name: "BPI → Metrobank Savings for the Holidays",
      });
      await expect(route).toBeVisible();
      const clipped = await route.evaluate((cell) =>
        [cell, ...cell.querySelectorAll("*")].some(
          (element) => element.scrollWidth > element.clientWidth
        )
      );
      expect(clipped).toBe(false);
      // Nor pushed out of view: the table fits its pane without scrolling sideways.
      const table = page.getByRole("table", { name: "Transactions" });
      const overflows = await table.evaluate((element) => {
        const container = element.parentElement;
        return container ? container.scrollWidth > container.clientWidth : true;
      });
      expect(overflows).toBe(false);
      await page.screenshot({ path: test.info().outputPath(`route-${width}.png`) });
    });
  }
});

test.describe("the open transaction", () => {
  async function listOf(page: Page, count: number) {
    await startHousehold(page);
    await page.getByRole("link", { name: "Transactions" }).first().click();
    for (let index = 1; index <= count; index++) {
      await addTransaction(page, { amount: `${index}00`, description: `Item ${index}` });
    }
    return page;
  }
  // "Item 1" in the table, "Item 1 minus ₱100.00 …" in the phone list.
  const rowOf = (page: Page, index: number) =>
    page.getByRole("button", { name: new RegExp(`^Item ${index}( minus|$)`) });
  const shows = (place: Locator, index: number) =>
    expect(place.getByRole("heading", { name: `Item ${index}`, exact: true })).toBeVisible();

  test("opens in a sheet on a phone; back closes it and the list keeps its place", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await listOf(page, 14);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const row = rowOf(page, 1);
    await expect(row).toBeInViewport();
    const scrolledTo = await page.evaluate(() => window.scrollY);
    expect(scrolledTo).toBeGreaterThan(0);

    await row.click();
    const sheet = page.getByRole("dialog", { name: "Item 1" });
    await shows(sheet, 1);
    await expect(page).toHaveURL(/[?&]open=/);
    await expect(page.getByRole("complementary")).toHaveCount(0);
    await sheet.screenshot({ path: test.info().outputPath("sheet-393.png") });

    await page.reload();
    await shows(sheet, 1);

    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]open=/);
    await expect(row).toBeInViewport();
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrolledTo)).toBeLessThan(5);
  });

  test("opens in a pane beside the list: 412px from a 1200px shell, 360px below", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await listOf(page, 3);
    // The expanded rail leaves the shell under 1200px; collapsed, it is over.
    await page
      .getByRole("button", { name: /^Toggle Sidebar/ })
      .first()
      .click();
    await expect(page.getByRole("complementary")).toHaveCount(0);
    const table = page.getByRole("table", { name: "Transactions" });
    const fullWidth = (await table.boundingBox())?.width ?? 0;

    await rowOf(page, 2).click();
    const pane = page.getByRole("complementary");
    await shows(pane, 2);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await pane.boundingBox())?.width).toBe(412);
    expect((await table.boundingBox())?.width ?? 0).toBeLessThan(fullWidth);
    await page.screenshot({ path: test.info().outputPath("pane-1366.png") });

    await page.reload();
    await shows(pane, 2);

    await page.setViewportSize({ width: 1024, height: 768 });
    await shows(pane, 2);
    expect((await pane.boundingBox())?.width).toBe(360);
    await page.screenshot({ path: test.info().outputPath("pane-1024.png") });
  });

  test("with two panes, opening items replaces the entry, so back leaves the page", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await listOf(page, 3);
    const pane = page.getByRole("complementary");
    for (const index of [1, 2, 3]) {
      await rowOf(page, index).click();
      await shows(pane, index);
    }

    await page.goBack();
    await expect(page).not.toHaveURL(/\/transactions/);
  });

  test("stays open while the window crosses 840 either way", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await listOf(page, 2);
    await page.setViewportSize({ width: 1024, height: 768 });
    await rowOf(page, 1).click();
    const pane = page.getByRole("complementary");
    await shows(pane, 1);

    await page.setViewportSize({ width: 700, height: 900 });
    const sheet = page.getByRole("dialog", { name: "Item 1" });
    await shows(sheet, 1);
    await expect(pane).toHaveCount(0);

    await page.setViewportSize({ width: 1024, height: 768 });
    await shows(pane, 1);
    await expect(sheet).toHaveCount(0);
  });

  test("opened in the pane, then narrowed to a sheet, back closes the sheet", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await listOf(page, 2);
    await rowOf(page, 1).click();
    await expect(page).toHaveURL(/open=/);

    await page.setViewportSize({ width: 700, height: 900 });
    const sheet = page.getByRole("dialog", { name: "Item 1" });
    await shows(sheet, 1);

    await page.goBack();
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL(/\/transactions$/);
  });
});
