import { test, expect, type Page } from "@playwright/test";
import { chooseOption, navigateTo, signUpNewPerson } from "./fixtures/helpers";

const unassignedItem = (page: Page, account: string) =>
  page
    .getByRole("list", { name: "Unassigned by account" })
    .getByRole("listitem")
    .filter({ has: page.getByText(account, { exact: true }) });

async function addAccount(page: Page, name: string) {
  const form = page.getByRole("form", { name: "Add an account" });
  await form.getByLabel("Account name").fill(name);
  await form.getByLabel("Starting balance (₱)").fill("0");
  await form.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
}

/** Types the amount into the category's Plan row; leaving the field saves it. */
async function planAmount(page: Page, category: string, amount: string) {
  const field = page.getByRole("textbox", { name: category, exact: true });
  await field.fill(amount);
  await field.blur();
  await expect(field).toHaveValue(new RegExp(`^${Number(amount).toLocaleString("en-US")}\\.00$`));
}

test("a payroll distribution from Plan leaves the source account's Unassigned at ₱0", async ({
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
  await page.getByRole("link", { name: "Edit plan" }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await planAmount(page, "Groceries", "8000");
  await planAmount(page, "Utilities", "29000");
  // A funding account other than the first is chosen in the budget's details.
  await page.getByRole("button", { name: "Transportation actions" }).click();
  await page.getByRole("button", { name: "Budget details" }).click();
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

  await expect(page).toHaveURL(/\/plan\?distribute=income/);
  const form = page.getByRole("form", { name: "Distribute money" });
  await expect(page.getByLabel("Income (₱)")).toHaveValue("40,000.00");
  await expect(form.getByRole("textbox", { name: "Groceries" })).toHaveValue("8,000.00");
  await expect(form.getByRole("combobox", { name: "Transportation goes to" })).toHaveText("GCash");
  await expect(form).toContainText("₱0.00 stays in Unassigned");
  await page.screenshot({ path: test.info().outputPath("distribute.png") });
  await form.getByRole("button", { name: "Distribute" }).click();

  await expect(form).toBeHidden();
  await expect(page).toHaveURL(/\/plan$/);
  const bar = page.getByRole("region", { name: "To assign" });
  await expect(bar).toContainText("₱0.00 to assign");
  await bar.getByRole("button", { name: "By account" }).click();
  await expect(unassignedItem(page, "BPI")).toContainText("₱0.00");
  await expect(unassignedItem(page, "GCash")).toContainText("₱0.00");
  await page.screenshot({ path: test.info().outputPath("plan.png"), fullPage: true });

  await page.goto("/budget");
  await expect(page.getByLabel("Transportation budget, spent and left")).toHaveText(
    "Budget₱3,000.00Spent₱0.00Left₱3,000.00"
  );

  // Spending past Groceries' budget turns it and its group red.
  await page.keyboard.press("n");
  const expense = page.getByRole("dialog", { name: "Add transaction" });
  await expense.getByLabel("Amount (₱)").fill("9000");
  await chooseOption(page, expense.getByLabel("Account"), "BPI");
  await chooseOption(page, expense.getByLabel("Category"), "Groceries");
  await expense.getByLabel("Description", { exact: true }).fill("Party supplies");
  await expense.getByRole("button", { name: "Add transaction" }).click();
  await expect(expense).toBeHidden();
  for (const name of ["Groceries", "Food"]) {
    const figures = page.getByLabel(`${name} budget, spent and left`);
    await expect(figures).toHaveText("Budget₱8,000.00Spent₱9,000.00Left-₱1,000.00");
    await expect(figures.getByText("-₱1,000.00")).toHaveClass(/text-destructive/);
    await expect(page.getByRole("progressbar", { name: `${name} spent` })).toHaveAttribute(
      "data-overspent",
      "true"
    );
  }
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
  await expect(page.getByRole("button", { name: "Restaurants ledger" })).toContainText("Retired");
  await expect(page.getByLabel("Restaurants budget, spent and left")).toHaveText(
    "BudgetNoneSpent₱500.00"
  );
  await expect(page.getByLabel("Food budget, spent and left")).toHaveText(
    "Budget₱8,000.00Spent₱9,500.00Left-₱1,500.00"
  );

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
