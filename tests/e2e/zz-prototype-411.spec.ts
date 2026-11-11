// PROTOTYPE (#411), throwaway: screenshots of each Break apart variant at phone width.
import { test, expect, type Page } from "@playwright/test";
import { chooseOption, signUpNewPerson, navigateTo } from "./fixtures/helpers";

const OUT = process.env.SHOTS ?? "test-results/proto-411";
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png` });

test("break apart variants", async ({ page }) => {
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
  await form
    .getByLabel("Statement file")
    .setInputFiles("tests/fixtures/statements/bdo-credit-card.pdf");
  await form.getByLabel("Password", { exact: true }).fill("fixture-password");
  await form.getByRole("button", { name: "Read statement" }).click();
  const drafts = page.getByRole("region", { name: "Import bdo-credit-card.pdf" });
  await expect(drafts).toContainText("7 drafts");
  await page.mouse.move(0, 0);
  await expect(page.getByText(/lines read from/)).toBeHidden({ timeout: 10_000 });
  const row = () => drafts.getByRole("button", { name: /^STREAMING SVC/ });
  const sheet = page.getByRole("dialog");

  // A: detail button, every part open.
  await page.goto("/import?variant=A");
  await row().click();
  await shot(page, "A-1-detail");
  await page.getByRole("button", { name: "Break apart…" }).click();
  await shot(page, "A-2-sheet-open");
  await sheet.getByLabel("Amount").fill("100");
  await sheet.getByRole("button", { name: "Add part" }).click();
  await shot(page, "A-3-two-parts");
  await sheet.getByRole("button", { name: /^Save/ }).scrollIntoViewIfNeeded();
  await shot(page, "A-4-footer");
  await page.keyboard.press("Escape");

  // B: amount link, split then name.
  await page.goto("/import?variant=B");
  await row().click();
  await shot(page, "B-1-detail");
  await page.getByRole("button", { name: "Break apart" }).click();
  await sheet.getByLabel("Part 1").fill("100");
  await shot(page, "B-2-amounts-remaining");
  await sheet.getByRole("button", { name: "Add part" }).click();
  await shot(page, "B-3-amounts-done");
  await sheet.getByRole("button", { name: "Next" }).click();
  await shot(page, "B-4-details");
  await page.keyboard.press("Escape");

  // C: selection bar, parts as rows.
  await page.goto("/import?variant=C");
  await drafts
    .getByRole("checkbox", { name: "Select all" })
    .uncheck()
    .catch(() => undefined);
  await page.getByLabel("Select all").click();
  if (await page.getByLabel("Select all").isChecked()) await page.getByLabel("Select all").click();
  await drafts.getByRole("checkbox", { name: /^Select STREAMING SVC/ }).check();
  await shot(page, "C-1-list-one-selected");
  await drafts.getByRole("button", { name: "Break apart" }).click();
  await shot(page, "C-2-sheet-open");
  await sheet.getByLabel("Amount").fill("100");
  await sheet.getByRole("button", { name: "Add part" }).click();
  await shot(page, "C-3-second-open");
  await sheet.getByRole("button", { name: "Done" }).click();
  await shot(page, "C-4-rows");
});
