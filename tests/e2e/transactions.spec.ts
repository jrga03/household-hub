import { test, expect, type Page } from "@playwright/test";
import {
  chooseOption,
  expectChosen,
  closeSheet,
  signUpNewPerson,
  navigateTo,
  openAccount,
  transactionRows,
} from "./fixtures/helpers";

const bankItem = (page: Page) =>
  page.getByRole("list", { name: "Accounts" }).getByRole("listitem").filter({ hasText: /^BPI/ });

test("transactions recorded offline move the balance, and a removal can be undone", async ({
  page,
}) => {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Transaction home");
  await page.getByRole("button", { name: "Create household" }).click();
  await navigateTo(page, "Accounts");

  const addAccount = page.getByRole("form", { name: "Add an account" });
  await addAccount.getByLabel("Account name").fill("BPI");
  await addAccount.getByLabel("Starting balance (₱)").fill("1000");
  await addAccount.getByRole("button", { name: "Add account" }).click();
  await expect(bankItem(page)).toContainText("₱1,000.00");

  await navigateTo(page, "Categories");
  await page.getByRole("button", { name: "Use suggested categories" }).click();
  await expect(page.getByRole("list", { name: "Food categories" })).toContainText("Groceries");
  await navigateTo(page, "Accounts");

  await page.context().setOffline(true);

  await page.keyboard.press("n");
  const dialog = page.getByRole("dialog", { name: "Add transaction" });
  await expect(dialog.getByLabel("Amount (₱)")).toBeFocused();
  await dialog.getByLabel("Amount (₱)").fill("250");
  await chooseOption(page, dialog.getByLabel("Category"), "Groceries");
  await dialog.getByLabel("Description", { exact: true }).fill("Market");
  await dialog.getByRole("button", { name: "Add transaction" }).click();
  await expect(dialog).toBeHidden();
  await expect(bankItem(page)).toContainText("₱750.00");
  await expect(bankItem(page)).toContainText("Unassigned ₱1,000.00");

  await page.keyboard.press("n");
  await expectChosen(dialog.getByLabel("Category"), "Groceries");
  await dialog.getByLabel("Amount (₱)").fill("1000");
  await dialog.getByRole("radio", { name: "Income" }).check();
  await expectChosen(dialog.getByLabel("Category"), "Unassigned");
  await dialog.getByRole("radio", { name: "Pending" }).check();
  await dialog.getByLabel("Description", { exact: true }).fill("Salary");
  await dialog.getByRole("button", { name: "Add transaction" }).click();
  await expect(bankItem(page)).toContainText("₱1,750.00");
  await expect(bankItem(page)).toContainText("Unassigned ₱2,000.00");
  const bank = await openAccount(page, "BPI");
  const figure = (term: string) =>
    bank.getByText(term, { exact: true }).locator("xpath=following-sibling::*[1]");
  await expect(figure("Cleared")).toContainText("₱750.00");
  await expect(figure("Pending")).toContainText("₱1,000.00");
  await closeSheet(page);

  // Home's Latest shows an expense with a minus sign, as the Transactions page does.
  await navigateTo(page, "Home");
  await expect(page.getByRole("list", { name: "Latest transactions" })).toContainText("−₱250.00");
  await navigateTo(page, "Accounts");

  // An account's View transactions opens Transactions filtered to it. Back online first: on a
  // fresh device the service worker is still waiting, so an unvisited route's code can't load offline.
  await page.context().setOffline(false);
  const details = await openAccount(page, "BPI");
  await details.getByRole("link", { name: "View transactions" }).click();
  await expect(page).toHaveURL(/\/transactions\?account=/);
  const market = transactionRows(page).filter({ hasText: "Market" });
  await market.getByRole("button", { name: /^Market/ }).click();
  // From 840px of shell width the row opens in the detail pane, below it in a bottom sheet.
  const detail = page
    .getByRole("dialog", { name: "Market" })
    .or(page.getByRole("region", { name: "Market" }));
  await detail.getByRole("button", { name: "Remove", exact: true }).click();
  const confirm = page.getByRole("alertdialog", { name: "Remove “Market” ₱250.00?" });
  await confirm.getByRole("button", { name: "Remove" }).click();
  await expect(market).toBeHidden();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(market).toBeVisible();
});
