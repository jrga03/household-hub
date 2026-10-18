import { test, expect, type Page } from "@playwright/test";
import { chooseOption, signUpNewPerson, navigateTo } from "./fixtures/helpers";

const unassignedItem = (page: Page) =>
  page
    .getByRole("list", { name: "Unassigned by account" })
    .getByRole("listitem")
    .filter({ hasText: "BDO Savings" });

/** The money a category holds, on its Plan row. */
const holds = (page: Page, name: string) =>
  page
    .getByRole("listitem")
    .filter({ has: page.getByRole("textbox", { name, exact: true }) })
    .getByText(/^Holds/);

test("moving money between envelopes, past Unassigned, with an undoable removal", async ({
  page,
}) => {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Allocation home");
  await page.getByRole("button", { name: "Create household" }).click();
  await navigateTo(page, "Accounts");

  const addAccount = page.getByRole("form", { name: "Add an account" });
  await addAccount.getByLabel("Account name").fill("BDO Savings");
  await addAccount.getByLabel("Starting balance (₱)").fill("20000");
  await addAccount.getByRole("button", { name: "Add account" }).click();

  await navigateTo(page, "Categories");
  await page.getByRole("button", { name: "Use suggested categories" }).click();
  await expect(page.getByRole("list", { name: "Food categories" })).toContainText("Groceries");

  await navigateTo(page, "Budget");
  await page.getByRole("link", { name: "Edit plan" }).click();
  const bar = page.getByRole("region", { name: "To assign" });
  await expect(bar).toContainText("₱20,000.00 to assign");
  await bar.getByRole("button", { name: "By account" }).click();
  await expect(unassignedItem(page)).toContainText("₱20,000.00");

  const dialog = page.getByRole("dialog", { name: "Move money" });
  await page.getByRole("button", { name: "Groceries actions" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Move money" }).click();
  await expect(dialog.getByLabel("To")).toHaveText("Groceries · ₱0.00");
  await dialog.getByLabel("Amount (₱)").fill("8000");
  await dialog.getByRole("button", { name: "Move money" }).click();
  await expect(dialog).toBeHidden();
  await expect(unassignedItem(page)).toContainText("₱12,000.00");

  await bar.getByRole("button", { name: "Move money" }).click();
  await dialog.getByLabel("Amount (₱)").fill("15000");
  await chooseOption(page, dialog.getByLabel("To"), "Forever House · ₱0.00");
  await expect(dialog).toContainText(
    "This leaves Unassigned in BDO Savings at -₱3,000.00. You can still move it"
  );
  await dialog.getByRole("button", { name: "Move money" }).click();
  await expect(dialog).toBeHidden();
  await expect(bar.getByText("-₱3,000.00").first()).toHaveClass(/text-shortfall/);
  await expect(unassignedItem(page)).toContainText("-₱3,000.00");
  await expect(unassignedItem(page)).toContainText("Allocated more than this account has");

  const allocations = page.getByRole("list", { name: "Allocations" });
  await expect(allocations.getByRole("listitem")).toHaveCount(2);
  await allocations
    .getByRole("button", { name: "Edit the ₱15,000.00 allocation to Forever House" })
    .click();
  await page
    .getByRole("dialog", { name: "Edit allocation" })
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(allocations.getByRole("listitem")).toHaveCount(1);
  await expect(unassignedItem(page)).toContainText("₱12,000.00");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(allocations.getByRole("listitem")).toHaveCount(2);
  await expect(unassignedItem(page)).toContainText("-₱3,000.00");

  await expect(holds(page, "Groceries")).toHaveText("Holds ₱8,000.00");

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/budget$/);
  await navigateTo(page, "Categories");
  await page.getByRole("button", { name: "Edit Groceries" }).click();
  await page.getByRole("button", { name: "Retire category" }).click();
  const retire = page.getByRole("dialog", { name: "Retire Groceries" });
  await expect(retire).toContainText("Groceries holds ₱8,000.00.");
  await chooseOption(page, retire.getByLabel("Move its money into"), "Restaurants");
  await retire.getByRole("button", { name: "Move and retire" }).click();
  await expect(retire).toBeHidden();
  await expect(page.getByRole("list", { name: "Food categories" })).not.toContainText("Groceries");

  await page.goto("/plan");
  await expect(page.getByRole("textbox", { name: "Groceries", exact: true })).toHaveCount(0);
  await expect(holds(page, "Restaurants")).toHaveText("Holds ₱8,000.00");
});
