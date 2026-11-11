// PROTOTYPE (#402), throwaway: screenshots of each Paid from variant at phone width.
import { test, expect, type Page } from "@playwright/test";
import { chooseOption, signUpNewPerson, navigateTo } from "./fixtures/helpers";

const OUT = process.env.SHOTS ?? "test-results/proto-402";
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

test("paid from variants", async ({ page }) => {
  test.setTimeout(180_000);
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Proto home");
  await page.getByRole("button", { name: "Create household" }).click();
  await navigateTo(page, "Accounts");
  const add = page.getByRole("form", { name: "Add an account" });
  for (const name of ["BDO Savings", "GCash"]) {
    await add.getByLabel("Account name").fill(name);
    await add.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByRole("list", { name: "Accounts" })).toContainText(name);
  }
  await add.getByLabel("Account name").fill("BDO Visa");
  await chooseOption(page, add.getByLabel("Type"), "Credit card");
  await chooseOption(page, add.getByLabel("Paid from"), "BDO Savings");
  await add.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("list", { name: "Accounts" })).toContainText("BDO Visa");

  await page.goto("/import");
  const form = page.getByRole("form", { name: "Read a statement" });
  await form.getByLabel("Statement file").setInputFiles("tests/fixtures/statements/bdo-credit-card.pdf");
  await form.getByLabel("Password", { exact: true }).fill("fixture-password");
  await form.getByRole("button", { name: "Read statement" }).click();
  const drafts = page.getByRole("region", { name: "Import bdo-credit-card.pdf" });
  await expect(drafts).toContainText("7 drafts");
  await page.mouse.move(0, 0);
  await expect(page.getByText(/lines read from/)).toBeHidden({ timeout: 10_000 });

  // A: set GCash on the selection through More → Paid from…
  await page.goto("/import?variant=A");
  await shot(page, "A-1-list");
  await drafts.getByRole("button", { name: "More actions" }).click();
  await shot(page, "A-2-menu");
  await page.getByRole("button", { name: "Paid from…" }).click();
  await chooseOption(page, page.getByRole("combobox", { name: "Paid from" }), "GCash");
  await shot(page, "A-3-sheet");
  await page.getByRole("button", { name: /^Set on/ }).click();
  await shot(page, "A-4-list-after");
  await drafts.getByRole("button", { name: /^STREAMING SVC/ }).click();
  await shot(page, "A-5-detail");

  await page.goto("/import?variant=B");
  await shot(page, "B-1-list");
  await drafts.getByRole("button", { name: /^STREAMING SVC/ }).click();
  await page.getByRole("button", { name: "Change" }).click();
  await shot(page, "B-2-detail-change");

  await page.goto("/import?variant=C");
  await shot(page, "C-1-list");
  await drafts.getByRole("button", { name: /^STREAMING SVC/ }).click();
  await shot(page, "C-2-detail");
});
