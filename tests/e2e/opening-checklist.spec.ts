import { test, expect } from "@playwright/test";
import { signUpNewPerson } from "./fixtures/helpers";

test("a new household's opening checklist ticks itself off and stays dismissed", async ({
  page,
}) => {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Opening home");
  await page.getByRole("button", { name: "Create household" }).click();

  const checklist = page.getByRole("list", { name: "Opening checklist" });
  await expect(checklist.getByRole("listitem")).toHaveText([
    /Set starting balances \(to do\)/,
    /Distribute them into categories \(to do\)/,
    /Set budgets \(to do\)/,
  ]);
  await page.screenshot({ path: test.info().outputPath("checklist-new.png"), fullPage: true });

  await checklist.getByRole("link", { name: "Add an account" }).click();
  const form = page.getByRole("form", { name: "Add an account" });
  await expect(form).toBeInViewport();
  await form.getByLabel("Account name").fill("BPI");
  await form.getByLabel("Starting balance (₱)").fill("40000");
  await form.getByRole("button", { name: "Add account" }).click();
  await expect(checklist.getByRole("listitem").first()).toHaveText(
    /Set starting balances \(done\)/
  );
  await page.screenshot({ path: test.info().outputPath("checklist-balance.png"), fullPage: true });

  await checklist.getByRole("link", { name: "Distribute" }).click();
  await expect(page).toHaveURL(/\/distribute\?mode=opening&account=/);
  await expect(page.getByText("Put an account's starting money into envelopes.")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("distribute-opening.png") });

  await page.goto("/");
  await page.getByRole("button", { name: "Dismiss the opening checklist" }).click();
  await expect(checklist).toBeHidden();
  await page.reload();
  await expect(page.getByRole("form", { name: "Add an account" })).toBeVisible();
  await expect(checklist).toBeHidden();
});
