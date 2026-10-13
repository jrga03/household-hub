import { test, expect, type Page } from "@playwright/test";
import { chooseOption, signUpNewPerson, navigateTo } from "./fixtures/helpers";

/** A household with ₱8,000 allocated to Groceries and a ₱1,200 Groceries expense, on Budget. */
async function groceriesThisMonth(page: Page) {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Ledger home");
  await page.getByRole("button", { name: "Create household" }).click();
  await navigateTo(page, "Accounts");

  const addAccount = page.getByRole("form", { name: "Add an account" });
  await addAccount.getByLabel("Account name").fill("BPI");
  await addAccount.getByLabel("Starting balance (₱)").fill("20000");
  await addAccount.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByText("BPI").first()).toBeVisible();

  await page.goto("/categories");
  await page.getByRole("button", { name: "Use suggested categories" }).click();
  await expect(page.getByRole("list", { name: "Food categories" })).toContainText("Groceries");

  await page.goto("/plan");
  const move = page.getByRole("dialog", { name: "Move money" });
  await page.getByRole("button", { name: "Move money" }).click();
  await move.getByLabel("Amount (₱)").fill("8000");
  await chooseOption(page, move.getByLabel("To"), "Groceries · ₱0.00");
  await move.getByRole("button", { name: "Move money" }).click();
  await expect(move).toBeHidden();

  await page.keyboard.press("n");
  const add = page.getByRole("dialog", { name: "Add transaction" });
  await add.getByLabel("Amount (₱)").fill("1200");
  await chooseOption(page, add.getByLabel("Category"), "Groceries");
  await add.getByLabel("Description (optional)").fill("Market");
  await add.getByRole("button", { name: "Add transaction" }).click();
  await expect(add).toBeHidden();
  await page.goto("/budget");
}

const groceriesLedger = (page: Page) => page.getByRole("list", { name: /^Groceries in / });

test.describe("wide screens", () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test("opens the ledger in the detail pane, and a row opens its record", async ({ page }) => {
    await groceriesThisMonth(page);

    await page.getByRole("button", { name: "Groceries ledger" }).click();
    const pane = page.getByRole("region", { name: "Groceries ledger" });
    await expect(pane).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(groceriesLedger(page).getByRole("listitem")).toHaveCount(2);
    await expect(pane).toContainText("+₱8,000.00");
    await expect(pane).toContainText("−₱1,200.00");
    await expect(pane).toContainText(/End of .*₱6,800\.00/);
    await page.screenshot({ path: test.info().outputPath("ledger-pane.png") });

    await groceriesLedger(page)
      .getByRole("button", { name: /Market/ })
      .click();
    await expect(page.getByRole("dialog", { name: "Edit transaction" })).toBeVisible();
  });
});

test.describe("phones", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("opens the ledger in a sheet", async ({ page }) => {
    await groceriesThisMonth(page);

    await page.getByRole("button", { name: "Groceries ledger" }).click();
    const sheet = page.getByRole("dialog", { name: "Groceries" });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(/End of .*₱6,800\.00/);
    await expect(sheet.getByRole("list", { name: "Budget history" })).toHaveCount(0);
    await expect(sheet).toContainText("No budget set yet.");
    // Waits for the sheet to finish sliding in.
    await sheet.screenshot({ path: test.info().outputPath("ledger-sheet.png") });

    await groceriesLedger(page)
      .getByRole("button", { name: /Groceries/ })
      .click();
    await expect(page.getByRole("dialog", { name: "Edit allocation" })).toBeVisible();
  });
});
