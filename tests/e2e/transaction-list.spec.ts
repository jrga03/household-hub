import { test, expect, type Page } from "@playwright/test";
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
  await dialog.getByLabel("Description (optional)").fill(entry.description);
  if (entry.pending) await dialog.getByRole("radio", { name: "Pending" }).check();
  await dialog.getByRole("button", { name: "Add transaction" }).click();
  await expect(dialog).toBeHidden();
}

async function startHousehold(page: Page) {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("List home");
  await page.getByRole("button", { name: "Create household" }).click();

  const addAccount = page.getByRole("form", { name: "Add an account" });
  await addAccount.getByLabel("Account name").fill("BPI");
  await addAccount.getByLabel("Starting balance (₱)").fill("10000");
  await addAccount.getByRole("button", { name: "Add account" }).click();
}

test("filters combine, and the totals and search follow them", async ({ page }) => {
  await startHousehold(page);

  await navigateTo(page, "Categories");
  await page.getByRole("button", { name: "Use suggested categories" }).click();
  await expect(page.getByRole("list", { name: "Food categories" })).toContainText("Groceries");

  await page.getByRole("link", { name: "Transactions" }).click();
  await addTransaction(page, { amount: "250", description: "Market", category: "Groceries" });
  await addTransaction(page, { amount: "120.50", description: "Bakery", category: "Groceries" });
  await addTransaction(page, { amount: "250", description: "Dinner", category: "Restaurants" });
  await addTransaction(page, { amount: "1000", description: "Salary", income: true });
  await addTransaction(page, { amount: "80", description: "Parking", category: "Unassigned" });

  const list = page.getByRole("list", { name: "Transactions" });
  const totals = page.getByRole("region", { name: "Totals" });
  const filters = page.getByRole("search", { name: "Filter transactions" });
  await expect(list.getByRole("listitem")).toHaveCount(5);
  await expect(totals.getByRole("group", { name: "Income" })).toContainText("₱1,000.00");
  await expect(totals.getByRole("group", { name: "Expenses" })).toContainText("₱700.50");
  await expect(totals.getByRole("group", { name: "Net" })).toContainText("₱299.50");

  await chooseOption(
    page,
    filters.getByLabel("Month", { exact: true }),
    format(new Date(), "MMMM yyyy")
  );
  await chooseOption(page, filters.getByLabel("Category", { exact: true }), "Groceries");
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(totals.getByRole("group", { name: "Income" })).toContainText("₱0.00");
  await expect(totals.getByRole("group", { name: "Expenses" })).toContainText("₱370.50");
  await expect(totals.getByRole("group", { name: "Net" })).toContainText("-₱370.50");

  await filters.getByRole("button", { name: "Clear filters" }).click();
  const search = filters.getByLabel("Search description, notes or amount");
  await search.pressSequentially("250");
  await expect(search).toHaveValue("250");
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list).toContainText("Market");
  await expect(list).toContainText("Dinner");
  await expect(totals.getByRole("group", { name: "Expenses" })).toContainText("₱500.00");

  await search.fill("");
  await page.getByRole("link", { name: "1 expense needs a category" }).click();
  await expect(filters.getByLabel("Needs a category")).toBeChecked();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list).toContainText("Parking");
  await expect(totals.getByRole("group", { name: "Expenses" })).toContainText("₱80.00");
});

test("selected pending transactions are marked cleared in one action", async ({ page }) => {
  await startHousehold(page);
  await page.getByRole("link", { name: "Transactions" }).click();
  const pending = ["Water", "Power", "Internet", "Rent", "Phone"];
  for (const description of pending) {
    await addTransaction(page, { amount: "100", description, pending: true });
  }
  await addTransaction(page, { amount: "50", description: "Snack" });

  const list = page.getByRole("list", { name: "Transactions" });
  await expect(list.getByRole("button", { name: "Mark cleared" })).toHaveCount(5);
  for (const description of pending) {
    await list.getByRole("checkbox", { name: `Select ${description}` }).check();
  }
  const toolbar = page.getByRole("toolbar", { name: "Selected transactions" });
  await expect(toolbar).toContainText("5 selected");
  await toolbar.getByRole("button", { name: "Mark cleared" }).click();

  await expect(page.getByText("Marked 5 transactions cleared")).toBeVisible();
  await expect(toolbar).toBeHidden();
  await expect(list.getByRole("button", { name: "Mark cleared" })).toHaveCount(0);
  await expect(list.getByRole("button", { name: "Mark pending" })).toHaveCount(6);
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
    const row = list.getByRole("button", { name: "Edit Item 1", exact: true });
    await expect(row).toBeInViewport();
    const scrolledTo = await page.evaluate(() => window.scrollY);
    expect(scrolledTo).toBeGreaterThan(0);
    await row.click();

    const pane = page.getByRole("region", { name: "Edit transaction" });
    await expect(pane.getByLabel("Description (optional)")).toHaveValue("Item 1");
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolledTo);

    await pane.getByLabel("Description (optional)").fill("Item one");
    await pane.getByRole("button", { name: "Save" }).click();
    await expect(list.getByRole("button", { name: "Edit Item one" })).toBeInViewport();
    // Rows are re-measured as they render, which can shift the page by a pixel or two.
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrolledTo)).toBeLessThan(5);
  });
});
