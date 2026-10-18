// PROTOTYPE (#177): seeds a dedicated account with budgets for judging the variants. Never merge to main.
import { expect, test, type Page } from "@playwright/test";
import { chooseOption } from "../fixtures/helpers";

const person = { email: "proto177@example.com", password: "TestPassword123!" };

async function planAmount(page: Page, category: string, amount: string) {
  const field = page.getByRole("textbox", { name: category, exact: true });
  await field.fill(amount);
  await field.blur();
  await expect(field).toHaveValue(new RegExp(`^${Number(amount).toLocaleString("en-US")}\\.00$`));
}

async function addExpense(page: Page, amount: string, category: string, description: string) {
  await page.keyboard.press("n");
  const add = page.getByRole("dialog", { name: "Add transaction" });
  await add.getByLabel("Amount (₱)").fill(amount);
  await chooseOption(page, add.getByLabel("Account"), "BPI");
  await chooseOption(page, add.getByLabel("Category"), category);
  await add.getByLabel("Description", { exact: true }).fill(description);
  await add.getByRole("button", { name: "Add transaction" }).click();
  await expect(add).toBeHidden();
}

test("seed proto177 account", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/signup");
  await page.fill('[name="email"]', person.email);
  await page.fill('[name="password"]', person.password);
  await page.fill('[name="confirmPassword"]', person.password);
  await page.click('button[type="submit"]');
  await page.getByLabel("Household name").fill("Prototype home");
  await page.getByRole("button", { name: "Create household" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/create-or-join"));

  await page.goto("/accounts");
  const form = page.getByRole("form", { name: "Add an account" });
  await form.getByLabel("Account name").fill("BPI");
  await form.getByLabel("Starting balance (₱)").fill("60000");
  await form.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByText("BPI", { exact: true }).first()).toBeVisible();

  await page.goto("/categories");
  await page.getByRole("button", { name: "Use suggested categories" }).click();
  await expect(page.getByRole("list", { name: "Food categories" })).toContainText("Groceries");

  await page.goto("/plan");
  await planAmount(page, "Groceries", "8000");
  await planAmount(page, "Restaurants", "3000");
  await planAmount(page, "Utilities", "6000");
  await planAmount(page, "Transportation", "3000");

  await addExpense(page, "2450", "Groceries", "Weekly market");
  await addExpense(page, "1890", "Restaurants", "Dinner out");
  await addExpense(page, "3200", "Utilities", "Meralco");

  await page.goto("/budget");
  await expect(page.getByLabel("Groceries budget, spent and left")).toBeVisible();
  await expect(page.getByRole("banner")).toContainText("Synced", { timeout: 30_000 });
  await page.screenshot({ path: test.info().outputPath("seeded-budget.png"), fullPage: true });
});
