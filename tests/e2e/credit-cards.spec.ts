import { test, expect, type Page } from "@playwright/test";
import { signUpNewPerson } from "./fixtures/helpers";

const accountsList = (page: Page) => page.getByRole("list", { name: "Accounts" });

async function chooseOption(page: Page, label: string, option: string) {
  await page.getByRole("form", { name: "Add an account" }).getByLabel(label).click();
  await page.getByRole("option", { name: option }).click();
}

test("a household credit card shows the bank account it is paid from", async ({ page }) => {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Card home");
  await page.getByRole("button", { name: "Create household" }).click();

  const addForm = page.getByRole("form", { name: "Add an account" });
  await addForm.getByLabel("Account name").fill("BDO Savings");
  await addForm.getByRole("button", { name: "Add account" }).click();
  await expect(accountsList(page)).toContainText("BDO Savings");

  await addForm.getByLabel("Account name").fill("Visa");
  await chooseOption(page, "Type", "Credit card");
  await chooseOption(page, "Paid from", "BDO Savings");
  await addForm.getByRole("button", { name: "Add account" }).click();

  const card = accountsList(page).getByRole("listitem").filter({ hasText: "Visa" });
  await expect(card).toContainText("Credit card · Paid from BDO Savings");

  // The bank can't be retired while the card pays from it.
  await page.getByRole("button", { name: "Edit BDO Savings" }).click();
  await page.getByRole("button", { name: "Retire account" }).click();
  await expect(
    page.getByText("Visa is paid from BDO Savings. Choose another paying account for it first.")
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(accountsList(page)).toContainText("BDO Savings");
});
