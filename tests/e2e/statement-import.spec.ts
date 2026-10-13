import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { chooseOption, signUpNewPerson, navigateTo } from "./fixtures/helpers";

const SYNTHETIC_BDO = "tests/fixtures/statements/bdo-credit-card.pdf";
const SYNTHETIC_UNIONBANK = "tests/fixtures/statements/unionbank-credit-card.xlsx";
const FIXTURE_PASSWORD = "fixture-password";

/** A new household with one credit card, installed and offline, on /import. */
async function openImportOffline(page: Page, context: BrowserContext, cardName: string) {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Import home");
  await page.getByRole("button", { name: "Create household" }).click();
  await navigateTo(page, "Accounts");

  const addAccount = page.getByRole("form", { name: "Add an account" });
  await addAccount.getByLabel("Account name").fill("Savings");
  await addAccount.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("list", { name: "Accounts" })).toContainText("Savings");
  await addAccount.getByLabel("Account name").fill(cardName);
  await chooseOption(page, addAccount.getByLabel("Type"), "Credit card");
  await chooseOption(page, addAccount.getByLabel("Paid from"), "Savings");
  await addAccount.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("list", { name: "Accounts" })).toContainText(cardName);

  // Installed: the service worker controls the page, so everything it precached is offline.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  await context.setOffline(true);
  await page.goto("/import");

  const form = page.getByRole("form", { name: "Read a statement" });
  await expect(form.getByLabel("Card")).toHaveText(cardName);
  return form;
}

test("a BDO statement is read offline, and its password can be remembered", async ({
  page,
  context,
}) => {
  const form = await openImportOffline(page, context, "BDO Visa");
  await form.getByLabel("Statement file").setInputFiles(SYNTHETIC_BDO);
  await form.getByLabel("Password", { exact: true }).fill("not-it");
  await form.getByRole("button", { name: "Read statement" }).click();
  await expect(form).toContainText("That password didn't open the statement.");

  await form.getByLabel("Statement file").setInputFiles(SYNTHETIC_BDO);
  await form.getByLabel("Password", { exact: true }).fill(FIXTURE_PASSWORD);
  await form.getByLabel("Remember password on this device").check();
  await form.getByRole("button", { name: "Read statement" }).click();

  const drafts = page.getByRole("region", { name: "Import bdo-credit-card.pdf" });
  await expect(drafts).toContainText("BDO Visa");
  await expect(drafts).toContainText("7 drafts");
  await expect(drafts.getByRole("listitem").filter({ hasText: "PAYMENT RECEIVED" })).toContainText(
    "Card payment"
  );
  await expect(drafts.getByRole("listitem").filter({ hasText: "STREAMING SVC" })).toContainText(
    "−₱549.00"
  );

  await page.reload();
  await expect(form.getByLabel("Password", { exact: true })).toHaveValue(FIXTURE_PASSWORD);
  await expect(form.getByLabel("Remember password on this device")).toBeChecked();
});

test("a UnionBank statement is read offline, and its password is never remembered", async ({
  page,
  context,
}) => {
  const form = await openImportOffline(page, context, "UnionBank Miles+");
  await chooseOption(page, form.getByLabel("Format"), "UnionBank credit card (XLSX)");
  await expect(form.getByLabel("Remember password on this device")).toHaveCount(0);

  await form.getByLabel("Statement file").setInputFiles(SYNTHETIC_UNIONBANK);
  await form.getByLabel("Password", { exact: true }).fill("not-it");
  await form.getByRole("button", { name: "Read statement" }).click();
  await expect(form).toContainText("That password didn't open the statement.");

  await form.getByLabel("Statement file").setInputFiles(SYNTHETIC_UNIONBANK);
  await form.getByLabel("Password", { exact: true }).fill(FIXTURE_PASSWORD);
  await form.getByRole("button", { name: "Read statement" }).click();

  const drafts = page.getByRole("region", { name: "Import unionbank-credit-card.xlsx" });
  await expect(drafts).toContainText("7 drafts");
  await expect(drafts.getByRole("listitem").filter({ hasText: "BDO BILLS PAYMENT" })).toContainText(
    "Card payment"
  );
  const reversal = drafts.getByRole("listitem").filter({ hasText: "LATE PAYMENT FEE REVERSAL" });
  await expect(reversal).toContainText("+₱1,096.69");
  await expect(reversal).not.toContainText("Card payment");
});

test("BDO drafts are saved in bulk offline, and a re-import is recognised", async ({
  page,
  context,
}) => {
  const form = await openImportOffline(page, context, "BDO Visa");
  const readFixture = async () => {
    await form.getByLabel("Statement file").setInputFiles(SYNTHETIC_BDO);
    await form.getByLabel("Password", { exact: true }).fill(FIXTURE_PASSWORD);
    await form.getByRole("button", { name: "Read statement" }).click();
  };
  await readFixture();

  // Every purchase starts selected; the card payment waits for its own decision.
  const drafts = page.getByRole("region", { name: "Import bdo-credit-card.pdf" });
  await expect(drafts.getByRole("listitem")).toHaveCount(7);
  await drafts.getByRole("button", { name: "Save 6 drafts" }).click();
  await expect(drafts.getByRole("listitem")).toHaveCount(1);

  await drafts.getByRole("button", { name: /PAYMENT RECEIVED/ }).click();
  await page.getByRole("button", { name: "Record as card payment" }).click();
  const pay = page.getByRole("form", { name: "Pay BDO Visa" });
  await pay.getByRole("button", { name: "Pay BDO Visa" }).click();
  await expect(page.getByText("No open imports.")).toBeVisible();

  await page.goto("/transactions");
  await expect(page.getByText("STREAMING SVC").first()).toBeVisible();

  await page.goto("/import");
  await readFixture();
  const again = page.getByRole("region", { name: "Import bdo-credit-card.pdf" });
  const purchases = again.getByRole("listitem").filter({ hasNotText: "PAYMENT RECEIVED" });
  await expect(purchases).toHaveCount(6);
  for (const purchase of await purchases.all()) {
    await expect(purchase).toContainText("Already imported");
  }
  await expect(again.getByRole("listitem").filter({ hasText: "PAYMENT RECEIVED" })).toContainText(
    "Card payment · recorded"
  );
  await expect(again.getByRole("button", { name: "Save 0 drafts" })).toBeDisabled();

  await again.getByRole("button", { name: "Discard 7 already recorded" }).click();
  await expect(page.getByText("No open imports.")).toBeVisible();
});
