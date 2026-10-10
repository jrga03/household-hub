import { test, expect, type Browser, type Page } from "@playwright/test";
import { signUpNewPerson } from "./fixtures/helpers";

// Fresh people per run: membership is one household per person, and events
// are append-only, so accounts made by the fixture users would pile up.
async function newPerson(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const person = await signUpNewPerson(page);
  return { context, page, email: person.email };
}

async function addAccount(page: Page, name: string, visibility: "Household" | "Personal") {
  const form = page.getByRole("form", { name: "Add an account" });
  await form.getByLabel("Account name").fill(name);
  await form.getByRole("radio", { name: visibility }).check();
  await form.getByRole("button", { name: "Add account" }).click();
  await expect(accountsList(page)).toContainText(name);
}

const accountsList = (page: Page) => page.getByRole("list", { name: "Accounts" });

test("a member's Personal account never reaches another member; their Household one does", async ({
  browser,
}) => {
  const owner = await newPerson(browser);
  await owner.page.getByLabel("Household name").fill("Visibility home");
  await owner.page.getByRole("button", { name: "Create household" }).click();
  const code = await owner.page.getByTestId("household-code").textContent();
  if (!code) throw new Error("The Owner sees no Household Code");

  const member = await newPerson(browser);
  await member.page.getByLabel("Household Code").fill(code);
  await member.page.getByRole("button", { name: "Send request" }).click();
  await owner.page.reload();
  await owner.page
    .getByRole("region", { name: "Join requests" })
    .getByRole("listitem")
    .filter({ hasText: member.email })
    .getByRole("button", { name: "Accept" })
    .click();
  await expect(member.page).toHaveURL((url) => url.pathname === "/", { timeout: 15_000 });

  const form = member.page.getByRole("form", { name: "Add an account" });
  await expect(form.getByRole("radio", { name: "Household" })).toBeChecked();

  // Personal first: once the owner has pulled the later Household account,
  // they have pulled past everything the member pushed before it.
  await addAccount(member.page, "B savings", "Personal");
  await expect(
    accountsList(member.page).getByRole("listitem").filter({ hasText: "B savings" })
  ).toContainText("Personal");
  await expect(form.getByRole("radio", { name: "Household" })).toBeChecked();
  await addAccount(member.page, "Shared groceries", "Household");

  await expect(async () => {
    await owner.page.reload();
    await expect(accountsList(owner.page)).toContainText("Shared groceries", { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(accountsList(owner.page)).not.toContainText("B savings");

  await Promise.all([owner.context.close(), member.context.close()]);
});
