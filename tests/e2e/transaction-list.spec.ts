import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { format } from "date-fns";
import { chooseOption, signUpNewPerson, navigateTo } from "./fixtures/helpers";

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
  await addTransaction(page, { amount: "80", description: "Parking", category: "Unassigned" });

  const list = page.getByRole("list", { name: "Transactions" });
  const filters = page.getByRole("search", { name: "Filter transactions" });
  await expect(list.getByRole("listitem")).toHaveCount(5);
  await expect(page.getByRole("region", { name: "Totals" })).toHaveCount(0);
  // Phones keep the filters behind a button.
  if (isMobile) await page.getByRole("button", { name: "Search and filters" }).click();

  await chooseOption(
    page,
    filters.getByLabel("Month", { exact: true }),
    format(new Date(), "MMMM yyyy")
  );
  await chooseOption(page, filters.getByLabel("Category", { exact: true }), "Groceries");
  await expect(list.getByRole("listitem")).toHaveCount(2);

  await filters.getByRole("button", { name: "Clear filters" }).click();
  const search = filters.getByLabel("Search description, notes or amount");
  await search.pressSequentially("250");
  await expect(search).toHaveValue("250");
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list).toContainText("Market");
  await expect(list).toContainText("Dinner");

  await search.fill("");
  await filters.getByLabel("Needs a category").check();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list).toContainText("Parking");
});

test("rows sit under their date, and a pending one is marked by an icon", async ({ page }) => {
  await startHousehold(page);
  await navigateTo(page, "Transactions");
  await addTransaction(page, { amount: "250", description: "Lunch", pending: true });
  await addTransaction(page, { amount: "1000", description: "Salary", income: true });

  const list = page.getByRole("list", { name: "Transactions" });
  await expect(list.getByRole("heading", { name: "Today" })).toBeVisible();
  const lunch = list.getByRole("listitem").filter({ hasText: "Lunch" });
  // An expense reads in parentheses and is announced as minus.
  await expect(lunch).toContainText("(₱250.00)");
  await expect(
    lunch.getByRole("button", { name: "Edit Lunch, minus ₱250.00, pending", exact: true })
  ).toBeVisible();
  await expect(lunch).toContainText("Unassigned · BPI");
  await expect(lunch.getByRole("img", { name: "Pending" })).toBeVisible();
  const salary = list.getByRole("listitem").filter({ hasText: "Salary" });
  await expect(salary).toContainText("+₱1,000.00");
  await expect(salary).not.toContainText("−");
  await expect(salary.getByRole("img", { name: "Pending" })).toHaveCount(0);
  await expect(list.getByRole("checkbox")).toHaveCount(0);
  await expect(list.getByRole("button", { name: /^Mark/ })).toHaveCount(0);
});

test("the last row stays inside the list's bottom border", async ({ page }) => {
  await startHousehold(page);
  await navigateTo(page, "Transactions");
  await addTransaction(page, { amount: "250", description: "Lunch" });
  await addTransaction(page, { amount: "80", description: "Parking" });

  const list = page.getByRole("list", { name: "Transactions" });
  const lastRow = list.getByRole("listitem").filter({ hasText: "Lunch" });
  await expect(lastRow).toBeVisible();
  const { lastRowBottom, borderTop } = await list.evaluate((element) => {
    const rows = element.querySelectorAll(":scope > li");
    const lastItem = rows[rows.length - 1];
    if (!lastItem) throw new Error("no rows");
    const listBox = element.getBoundingClientRect();
    const bottomBorder = parseFloat(window.getComputedStyle(element).borderBottomWidth);
    return {
      lastRowBottom: lastItem.getBoundingClientRect().bottom,
      borderTop: listBox.bottom - bottomBorder,
    };
  });
  expect(lastRowBottom).toBeLessThanOrEqual(borderTop);
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
  await list.getByRole("button", { name: "Select Water" }).click();
  await list.getByRole("button", { name: "Select Power" }).click();
  await expect(header.getByRole("heading", { name: "2 selected" })).toBeVisible();
  await expect(list.getByRole("button", { name: "Select Power" })).toHaveAttribute(
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
  await expect(list.getByRole("listitem").filter({ hasText: "Water" })).toContainText(
    "Groceries · BPI"
  );
  await expect(list.getByRole("button", { name: "Edit Water" })).toBeVisible();

  await header.getByRole("button", { name: "Select", exact: true }).click();
  await header.getByRole("button", { name: "Select all" }).click();
  await expect(header.getByRole("heading", { name: "3 selected" })).toBeVisible();
  await toolbar.getByRole("button", { name: "Remove" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Remove 3 transactions?" });
  await confirm.getByRole("button", { name: "Remove" }).click();
  await expect(list).toBeHidden();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(3);

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
    await expect(coffee.getByRole("button", { name: "Select Coffee" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("on a wide screen", () => {
  test.use({ viewport: { width: 1600, height: 600 } });

  test("a row opens in the detail pane and the list keeps its place", async ({ page }) => {
    await startHousehold(page);
    await page.getByRole("link", { name: "Transactions" }).click();
    for (let index = 1; index <= 12; index++) {
      await addTransaction(page, { amount: `${index}00`, description: `Item ${index}` });
    }

    const list = page.getByRole("list", { name: "Transactions" });
    // The oldest row renders only once the page scrolls down to it.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const row = list.getByRole("button", {
      name: "Edit Item 1, minus ₱100.00",
      exact: true,
    });
    await expect(row).toBeInViewport();
    const scrolledTo = await page.evaluate(() => window.scrollY);
    expect(scrolledTo).toBeGreaterThan(0);
    await row.click();

    const pane = page.getByRole("region", { name: "Edit transaction" });
    await expect(pane.getByLabel("Description", { exact: true })).toHaveValue("Item 1");
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolledTo);

    await pane.getByLabel("Description", { exact: true }).fill("Item one");
    await pane.getByRole("button", { name: "Save" }).click();
    await expect(list.getByRole("button", { name: "Edit Item one" })).toBeInViewport();
    // Rows are re-measured as they render, which can shift the page by a pixel or two.
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrolledTo)).toBeLessThan(5);
  });
});
