import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { chooseOption, signUpNewPerson, navigateTo } from "./fixtures/helpers";

async function downloadText(page: Page, buttonName: string) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: buttonName }).click(),
  ]);
  const path = await download.path();
  return { filename: download.suggestedFilename(), text: await readFile(path, "utf8") };
}

test("exports transactions and the event log offline, from what the device holds", async ({
  page,
}) => {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Export home");
  await page.getByRole("button", { name: "Create household" }).click();
  await navigateTo(page, "Accounts");

  const addAccount = page.getByRole("form", { name: "Add an account" });
  await addAccount.getByLabel("Account name").fill("BPI");
  await addAccount.getByLabel("Starting balance (₱)").fill("1000");
  await addAccount.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("list", { name: "Accounts" })).toContainText("BPI");

  await navigateTo(page, "Categories");
  await page.getByRole("button", { name: "Use suggested categories" }).click();
  await expect(page.getByRole("list", { name: "Food categories" })).toContainText("Groceries");
  await page.getByRole("link", { name: "Home" }).click();

  await page.keyboard.press("n");
  const dialog = page.getByRole("dialog", { name: "Add transaction" });
  await dialog.getByLabel("Amount (₱)").fill("250");
  await chooseOption(page, dialog.getByLabel("Category"), "Groceries");
  await dialog.getByLabel("Description", { exact: true }).fill("Market, Saturday");
  await dialog.getByRole("button", { name: "Add transaction" }).click();
  await expect(dialog).toBeHidden();

  await page.context().setOffline(true);
  await navigateTo(page, "Settings");
  await expect(page.getByRole("button", { name: "Transactions (CSV)" })).toBeVisible();

  const csv = await downloadText(page, "Transactions (CSV)");
  expect(csv.filename).toMatch(/^household-hub-transactions-\d{4}-\d{2}-\d{2}\.csv$/);
  expect(csv.text).toMatch(
    /^\uFEFFDate,Type,Amount,Account,To account,Category,Status,Description,Notes\r\n\d{4}-\d{2}-\d{2},Expense,250\.00,BPI,,Groceries,Cleared,"Market, Saturday",\r\n$/
  );

  const log = await downloadText(page, "Event log (JSON)");
  expect(log.filename).toMatch(/^household-hub-event-log-\d{4}-\d{2}-\d{2}\.json$/);
  const { events } = JSON.parse(log.text) as { events: { eventType: string }[] };
  expect(events.map((event) => event.eventType)).toContain("transaction.created");
  expect(events.map((event) => event.eventType)).toContain("account.created");
});
