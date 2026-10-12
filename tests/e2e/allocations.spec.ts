import { test, expect, type Page } from "@playwright/test";
import { chooseOption, signUpNewPerson } from "./fixtures/helpers";

const unassignedItem = (page: Page) =>
  page
    .getByRole("list", { name: "Unassigned by account" })
    .getByRole("listitem")
    .filter({ hasText: "BDO Savings" });

const categoryItem = (page: Page, group: string, name: string) =>
  page
    .getByRole("list", { name: `${group} categories` })
    .getByRole("listitem")
    .filter({
      has: page.getByText(name, { exact: true }),
    });

test("moving money between envelopes, past Unassigned, with an undoable removal", async ({
  page,
}) => {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Allocation home");
  await page.getByRole("button", { name: "Create household" }).click();

  const addAccount = page.getByRole("form", { name: "Add an account" });
  await addAccount.getByLabel("Account name").fill("BDO Savings");
  await addAccount.getByLabel("Starting balance (₱)").fill("20000");
  await addAccount.getByRole("button", { name: "Add account" }).click();

  await page.getByRole("link", { name: "Categories" }).click();
  await page.getByRole("button", { name: "Use suggested categories" }).click();
  await expect(unassignedItem(page)).toContainText("₱20,000.00");

  const dialog = page.getByRole("dialog", { name: "Move money" });
  await page.getByRole("button", { name: "Move money" }).click();
  await dialog.getByLabel("Amount (₱)").fill("8000");
  await chooseOption(page, dialog.getByLabel("To"), "Groceries · ₱0.00");
  await dialog.getByRole("button", { name: "Move money" }).click();
  await expect(dialog).toBeHidden();
  await expect(unassignedItem(page)).toContainText("₱12,000.00");
  await expect(categoryItem(page, "Food", "Groceries")).toContainText("₱8,000.00");
  // The group's total sits beside its Edit button.
  await expect(page.getByRole("button", { name: "Edit group Food" }).locator("..")).toContainText(
    "₱8,000.00"
  );

  await page.getByRole("button", { name: "Move money" }).click();
  await dialog.getByLabel("Amount (₱)").fill("15000");
  await chooseOption(page, dialog.getByLabel("To"), "Forever House · ₱0.00");
  await expect(dialog).toContainText(
    "This leaves Unassigned in BDO Savings at -₱3,000.00. You can still move it"
  );
  await dialog.getByRole("button", { name: "Move money" }).click();
  await expect(dialog).toBeHidden();
  await expect(unassignedItem(page)).toContainText("-₱3,000.00");
  await expect(unassignedItem(page)).toContainText("Allocated more than this account has");
  await expect(unassignedItem(page).getByText("-₱3,000.00")).toHaveClass(/text-destructive/);

  const groceries = categoryItem(page, "Food", "Groceries");
  await groceries.getByRole("button", { name: "Groceries by account" }).click();
  await expect(page.getByRole("list", { name: "Groceries by account" })).toContainText(
    "BDO Savings₱8,000.00"
  );

  const moves = page.getByRole("list", { name: "Moves" });
  await expect(moves.getByRole("listitem")).toHaveCount(2);
  await moves.getByRole("button", { name: "Edit the ₱15,000.00 move to Forever House" }).click();
  await page
    .getByRole("dialog", { name: "Edit move" })
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(moves.getByRole("listitem")).toHaveCount(1);
  await expect(unassignedItem(page)).toContainText("₱12,000.00");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(moves.getByRole("listitem")).toHaveCount(2);
  await expect(unassignedItem(page)).toContainText("-₱3,000.00");

  await groceries.getByRole("button", { name: "Edit Groceries" }).click();
  await page.getByRole("button", { name: "Retire category" }).click();
  await expect(page.getByRole("list", { name: "Retired, still holding money" })).toContainText(
    "Groceries₱8,000.00"
  );
});
