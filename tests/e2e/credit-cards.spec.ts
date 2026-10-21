import { test, expect, type Page } from "@playwright/test";
import {
  chooseOption,
  closeSheet,
  navigateTo,
  openAccount,
  signUpNewPerson,
} from "./fixtures/helpers";

const accountsList = (page: Page) => page.getByRole("list", { name: "Accounts" });

test("a household credit card shows the bank account it is paid from", async ({ page }) => {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Card home");
  await page.getByRole("button", { name: "Create household" }).click();
  await navigateTo(page, "Accounts");

  const addForm = page.getByRole("form", { name: "Add an account" });
  await addForm.getByLabel("Account name").fill("BDO Savings");
  await addForm.getByRole("button", { name: "Add account" }).click();
  await expect(accountsList(page)).toContainText("BDO Savings");

  await addForm.getByLabel("Account name").fill("Visa");
  await chooseOption(page, addForm.getByLabel("Type"), "Credit card");
  await chooseOption(page, addForm.getByLabel("Paid from"), "BDO Savings");
  await addForm.getByRole("button", { name: "Add account" }).click();

  const cards = accountsList(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: "Credit cards" }) });
  await expect(cards).toContainText("Visa");
  await expect(cards).toContainText("Paid from BDO Savings");

  // The bank can't be retired while the card pays from it.
  const bank = await openAccount(page, "BDO Savings");
  await bank.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Retire account" }).click();
  await expect(
    page.getByText("Visa is paid from BDO Savings. Choose another paying account for it first.")
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("form", { name: "Edit account" })).toBeHidden();
  await closeSheet(page);
  await expect(accountsList(page)).toContainText("BDO Savings");
});
