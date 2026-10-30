import { test, expect, type Page } from "@playwright/test";
import { chooseOption, login, navigateTo, signUpNewPerson } from "./fixtures/helpers";
import { VIEWPORTS } from "./fixtures/viewports";

const unassignedItem = (page: Page, account: string) =>
  page
    .getByRole("list", { name: "Unassigned by account" })
    .getByRole("listitem")
    .filter({ has: page.getByText(account, { exact: true }) });

/** A Budget row, found by its one button: the category's name. */
const budgetRow = (page: Page, name: string | RegExp) =>
  page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name, exact: typeof name === "string" }) });

/** A Budget group's left, in its header ahead of the rows'. */
const groupLeft = (page: Page, group: string) =>
  page.getByRole("region", { name: group }).getByTestId("left").first();

const barIndicator = (page: Page, name: string) =>
  page
    .getByRole("progressbar", { name: `${name} spent` })
    .locator("[data-slot=progress-indicator]");

async function addAccount(page: Page, name: string) {
  const form = page.getByRole("form", { name: "Add an account" });
  await form.getByLabel("Account name").fill(name);
  await form.getByLabel("Starting balance (₱)").fill("0");
  await form.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
}

/** Types the amount into the category's Set budgets row; leaving the field saves it. */
async function planAmount(page: Page, category: string, amount: string) {
  const field = page.getByRole("textbox", { name: category, exact: true });
  await field.fill(amount);
  await field.blur();
  await expect(field).toHaveValue(new RegExp(`^${Number(amount).toLocaleString("en-US")}\\.00$`));
}

test("a payroll distribution from Assign money leaves the source account's Unassigned at ₱0", async ({
  page,
}) => {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Payday home");
  await page.getByRole("button", { name: "Create household" }).click();
  await navigateTo(page, "Accounts");
  await addAccount(page, "BPI");
  await addAccount(page, "GCash");

  await page.goto("/categories");
  await page.getByRole("button", { name: "Use suggested categories" }).click();
  await expect(page.getByRole("list", { name: "Food categories" })).toContainText("Groceries");

  await page.goto("/budget");
  await page.getByRole("link", { name: "Set budgets" }).click();
  await expect(page).toHaveURL(/\/set-budgets$/);
  await planAmount(page, "Groceries", "8000");
  await planAmount(page, "Utilities", "29000");
  // A funding account other than the first is chosen in the budget's details.
  await page.getByRole("button", { name: "Transportation budget details" }).click();
  const details = page.getByRole("dialog", { name: "Budget for Transportation" });
  await details.getByLabel("Amount (₱)").fill("3000");
  await chooseOption(page, details.getByLabel("Funding account"), "GCash");
  await details.getByRole("button", { name: "Save budget" }).click();
  await expect(details).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Transportation", exact: true })).toHaveValue(
    "3,000.00"
  );

  await page.keyboard.press("n");
  const add = page.getByRole("dialog", { name: "Add transaction" });
  await add.getByRole("radio", { name: "Income" }).check();
  await add.getByLabel("Amount (₱)").fill("40000");
  await chooseOption(page, add.getByLabel("Account"), "BPI");
  await add.getByLabel("Description", { exact: true }).fill("Payday");
  await add.getByRole("button", { name: "Add transaction" }).click();
  await expect(add).toBeHidden();
  await page.locator("[data-sonner-toast]").getByRole("button", { name: "Distribute" }).click();

  await expect(page).toHaveURL(/\/assign-money\?distribute=income/);
  const form = page.getByRole("form", { name: "Distribute money" });
  await expect(page.getByLabel("Income (₱)")).toHaveValue("40,000.00");
  await expect(form.getByRole("textbox", { name: "Groceries" })).toHaveValue("8,000.00");
  await expect(form.getByRole("combobox", { name: "Transportation goes to" })).toHaveText("GCash");
  await expect(form).toContainText("₱0.00 stays in Unassigned");
  await page.screenshot({ path: test.info().outputPath("distribute.png") });
  await form.getByRole("button", { name: "Distribute" }).click();

  await expect(form).toBeHidden();
  await expect(page).toHaveURL(/\/assign-money$/);
  await expect(page.getByRole("region", { name: "Unassigned" })).toContainText("₱0.00");
  await page.getByRole("button", { name: "By account" }).click();
  await expect(unassignedItem(page, "BPI")).toContainText("₱0.00");
  await expect(unassignedItem(page, "GCash")).toContainText("₱0.00");
  await page.screenshot({ path: test.info().outputPath("assign-money.png"), fullPage: true });

  await page.goto("/budget");
  await expect(budgetRow(page, "Transportation").getByTestId("left")).toContainText("₱3,000.00");

  // Spending past Groceries' budget turns it and its group's left and bar to shortfall.
  await page.keyboard.press("n");
  const expense = page.getByRole("dialog", { name: "Add transaction" });
  await expense.getByLabel("Amount (₱)").fill("9000");
  await chooseOption(page, expense.getByLabel("Account"), "BPI");
  await chooseOption(page, expense.getByLabel("Category"), "Groceries");
  await expense.getByLabel("Description", { exact: true }).fill("Party supplies");
  await expense.getByRole("button", { name: "Add transaction" }).click();
  await expect(expense).toBeHidden();
  const groceriesLeft = budgetRow(page, "Groceries").getByTestId("left");
  await expect(groceriesLeft).toContainText("−₱1,000.00");
  await expect(groceriesLeft.getByText("−₱1,000.00").locator("..")).toHaveClass(/text-shortfall/);
  await expect(groupLeft(page, "Food").getByText("−₱1,000.00").locator("..")).toHaveClass(
    /text-shortfall/
  );
  await expect(barIndicator(page, "Groceries")).toHaveClass(/bg-shortfall/);
  await expect(barIndicator(page, "All budgets")).toHaveClass(/bg-primary/);

  // A category retired this month keeps its row and its spending in the group.
  await page.keyboard.press("n");
  await expense.getByLabel("Amount (₱)").fill("500");
  await chooseOption(page, expense.getByLabel("Account"), "BPI");
  await chooseOption(page, expense.getByLabel("Category"), "Restaurants");
  await expense.getByLabel("Description", { exact: true }).fill("Lunch");
  await expense.getByRole("button", { name: "Add transaction" }).click();
  await expect(expense).toBeHidden();
  await page.goto("/categories");
  await page.getByRole("button", { name: "Edit Restaurants" }).click();
  await page.getByRole("button", { name: "Retire category" }).click();
  const retire = page.getByRole("dialog", { name: "Retire Restaurants" });
  await chooseOption(page, retire.getByLabel("Move its money into"), "Delivery");
  await retire.getByRole("button", { name: "Move and retire" }).click();
  await expect(retire).toBeHidden();
  await page.goto("/budget");
  const restaurants = budgetRow(page, /^Restaurants/);
  await expect(restaurants).toContainText("Retired");
  await expect(restaurants).toContainText("None");
  await expect(restaurants.getByTestId("left")).toContainText("₱500.00");
  await expect(groupLeft(page, "Food")).toContainText("−₱1,500.00");

  // The bar slides to full; wait for it before the screenshot.
  const groceriesBar = page.getByRole("progressbar", { name: "Groceries spent" });
  await expect
    .poll(() =>
      groceriesBar.evaluate((bar) => {
        const fill = bar.firstElementChild?.getBoundingClientRect();
        return fill ? Math.round(fill.right - bar.getBoundingClientRect().right) : null;
      })
    )
    .toBe(0);
  await page.screenshot({ path: test.info().outputPath("budget.png"), fullPage: true });
});

test.describe("on a phone", () => {
  test.use({ viewport: VIEWPORTS.compact });

  test("Set budgets and Assign money sit under the header and keep the picked month", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/budget");
    await expect(page.getByRole("banner").getByRole("link", { name: "Set budgets" })).toBeHidden();
    await expect(page.getByRole("banner").getByRole("link", { name: "Assign money" })).toBeHidden();

    await page.getByRole("button", { name: "Previous month" }).click();
    await expect(page.getByRole("button", { name: "Back to this month" })).toBeVisible();
    const month = new URL(page.url()).searchParams.get("month");
    expect(month).toMatch(/^\d{4}-\d{2}$/);

    await page.getByRole("main").getByRole("link", { name: "Set budgets" }).click();
    await expect(page).toHaveURL(new RegExp(`/set-budgets\\?month=${month}$`));
    await page.goBack();
    await page.getByRole("main").getByRole("link", { name: "Assign money" }).click();
    await expect(page).toHaveURL(new RegExp(`/assign-money\\?month=${month}$`));
  });
});

test("closing Distribute and then going back leaves Assign money for Budget", async ({ page }) => {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Back home");
  await page.getByRole("button", { name: "Create household" }).click();
  await navigateTo(page, "Accounts");
  const form = page.getByRole("form", { name: "Add an account" });
  await form.getByLabel("Account name").fill("BDO Savings");
  await form.getByLabel("Starting balance (₱)").fill("20000");
  await form.getByRole("button", { name: "Add account" }).click();
  await navigateTo(page, "Categories");
  await page.getByRole("button", { name: "Use suggested categories" }).click();
  await expect(page.getByRole("list", { name: "Food categories" })).toContainText("Groceries");

  await navigateTo(page, "Budget");
  await page.getByRole("link", { name: "Assign money" }).click();
  const distribute = page.getByRole("dialog", { name: "Distribute money" });

  // The help explains the screen, by keyboard too.
  await page.getByRole("button", { name: "About assigning money" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("Unassigned is money in your accounts");
  await page.keyboard.press("Escape");

  // The browser's back closes the sheet and stays on Assign money.
  await page.getByRole("button", { name: "Distribute", exact: true }).click();
  await expect(distribute).toBeVisible();
  await page.goBack();
  await expect(distribute).toBeHidden();
  await expect(page).toHaveURL(/\/assign-money$/);

  await page.getByRole("button", { name: "Distribute", exact: true }).click();
  await expect(distribute).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(distribute).toBeHidden();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/budget$/);
  await expect(distribute).toBeHidden();
});
