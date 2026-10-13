import { test, expect } from "@playwright/test";
import { chooseOption, signUpNewPerson } from "./fixtures/helpers";

const SYNTHETIC_BDO = "tests/fixtures/statements/bdo-credit-card.pdf";
const FIXTURE_PASSWORD = "fixture-password";

test("a BDO statement is read offline, and its password can be remembered", async ({
  page,
  context,
}) => {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Import home");
  await page.getByRole("button", { name: "Create household" }).click();

  const addAccount = page.getByRole("form", { name: "Add an account" });
  await addAccount.getByLabel("Account name").fill("BDO Savings");
  await addAccount.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("list", { name: "Accounts" })).toContainText("BDO Savings");
  await addAccount.getByLabel("Account name").fill("BDO Visa");
  await chooseOption(page, addAccount.getByLabel("Type"), "Credit card");
  await chooseOption(page, addAccount.getByLabel("Paid from"), "BDO Savings");
  await addAccount.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("list", { name: "Accounts" })).toContainText("BDO Visa");

  // Installed: the service worker controls the page, so everything it precached is offline.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  await context.setOffline(true);
  await page.goto("/import");

  const form = page.getByRole("form", { name: "Read a statement" });
  await expect(form.getByLabel("Card")).toHaveText("BDO Visa");
  await form.getByLabel("Statement file").setInputFiles(SYNTHETIC_BDO);
  await form.getByLabel("Password", { exact: true }).fill("not-it");
  await form.getByRole("button", { name: "Read statement" }).click();
  await expect(form).toContainText("That password didn't open the statement.");

  await form.getByLabel("Statement file").setInputFiles(SYNTHETIC_BDO);
  await form.getByLabel("Password", { exact: true }).fill(FIXTURE_PASSWORD);
  await form.getByLabel("Remember password on this device").check();
  await form.getByRole("button", { name: "Read statement" }).click();

  const lines = page.getByRole("region", { name: "Statement lines" });
  await expect(lines).toContainText("7 lines read from bdo-credit-card.pdf");
  await expect(lines.getByRole("listitem").filter({ hasText: "PAYMENT RECEIVED" })).toContainText(
    "Card payment"
  );
  await expect(lines.getByRole("listitem").filter({ hasText: "STREAMING SVC" })).toContainText(
    "−₱549.00"
  );

  await page.reload();
  await expect(form.getByLabel("Password", { exact: true })).toHaveValue(FIXTURE_PASSWORD);
  await expect(form.getByLabel("Remember password on this device")).toBeChecked();
});
