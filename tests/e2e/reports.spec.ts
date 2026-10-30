import { test, expect } from "@playwright/test";
import { chooseOption, navigateTo, signUpNewPerson, transactionRows } from "./fixtures/helpers";

test("Reports opens from the nav, switches the period and steps the end month back", async ({
  page,
}) => {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Reports home");
  await page.getByRole("button", { name: "Create household" }).click();
  await expect(page).toHaveURL(/\/$/);
  // October 2026 is the first month of data, so the end month needs a later today to step back.
  await page.clock.setFixedTime(new Date("2026-12-15T10:00:00"));
  await page.reload();

  await navigateTo(page, "Reports");
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole("region", { name: "Spending, Dec 2026" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next month" })).toBeDisabled();

  await page.getByRole("radio", { name: "3 months" }).click();
  await expect(page).toHaveURL(/period=3m/);
  await expect(page.getByRole("region", { name: "Spending, Oct – Dec 2026" })).toBeVisible();

  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page).toHaveURL(/end=2026-11/);
  await expect(page.getByRole("region", { name: "Spending, Oct – Nov 2026" })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("region", { name: "Spending, Oct – Dec 2026" })).toBeVisible();
});

test("a category's month bar opens its transactions with the same Spent, and back returns", async ({
  page,
  isMobile,
}) => {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Reports pane home");
  await page.getByRole("button", { name: "Create household" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.clock.setFixedTime(new Date("2026-12-15T10:00:00"));
  await page.reload();

  await navigateTo(page, "Accounts");
  const addAccount = page.getByRole("form", { name: "Add an account" });
  await addAccount.getByLabel("Account name").fill("BPI");
  await addAccount.getByLabel("Starting balance (₱)").fill("5000");
  await addAccount.getByRole("button", { name: "Add account" }).click();
  await navigateTo(page, "Categories");
  await page.getByRole("button", { name: "Use suggested categories" }).click();
  await expect(page.getByRole("list", { name: "Food categories" })).toContainText("Groceries");

  const dialog = page.getByRole("dialog", { name: "Add transaction" });
  async function record(date: string, amount: string, description: string, income = false) {
    await page.keyboard.press("n");
    await dialog.getByLabel("Amount (₱)").fill(amount);
    if (income) await dialog.getByRole("radio", { name: "Income" }).check();
    await chooseOption(page, dialog.getByLabel("Category"), "Groceries");
    await dialog.getByLabel("Date").fill(date);
    await dialog.getByLabel("Description", { exact: true }).fill(description);
    await dialog.getByRole("button", { name: "Add transaction" }).click();
    await expect(dialog).toBeHidden();
  }
  await record("2026-11-10", "250", "Market");
  await record("2026-12-05", "400", "Grocer");
  await record("2026-12-06", "100", "Refund", true);

  await navigateTo(page, "Reports");
  await page.getByRole("button", { name: /^Groceries/ }).click();
  const pane = page.getByRole(isMobile ? "dialog" : "region", { name: "Groceries" });
  await expect(pane).toContainText("Spending, Dec 2026₱300.00");
  const reportsUrl = page.url();

  await pane.getByRole("link", { name: "December 2026: ₱300.00 spent" }).click();
  await expect(page).toHaveURL(
    /\/transactions\?month=2026-12&category=[\w-]+&visibility=household$/
  );
  if (isMobile) {
    // Phones show no summary; the two December rows are what Spent would sum.
    await expect(transactionRows(page)).toHaveCount(2);
  } else {
    await expect(page.getByText(/^Spent/)).toContainText("Spent ₱300.00");
  }

  await page.goBack();
  await expect(page).toHaveURL(reportsUrl);
  await expect(pane).toContainText("Spending, Dec 2026₱300.00");
});
