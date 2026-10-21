import { test, expect, type Browser, type Page } from "@playwright/test";
import { signUpNewPerson } from "./fixtures/helpers";

// Fresh people per run: membership is one household per person, and events are append-only.
async function newPerson(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const person = await signUpNewPerson(page);
  return { context, page, email: person.email };
}

const groupsList = (page: Page) => page.getByRole("list", { name: "Groups" });

test("suggested categories reach every member; a Personal category reaches only its owner", async ({
  browser,
}) => {
  const owner = await newPerson(browser);
  await owner.page.getByLabel("Household name").fill("Category home");
  await owner.page.getByRole("button", { name: "Create household" }).click();
  await owner.page.goto("/settings?open=household");
  const code = await owner.page.getByTestId("household-code").textContent();
  if (!code) throw new Error("The Owner sees no Household Code");

  await owner.page.goto("/categories");
  await owner.page.getByRole("button", { name: "Use suggested categories" }).click();
  for (const group of ["Savings", "Bills", "Food", "Getting Around", "Personal"]) {
    await expect(groupsList(owner.page)).toContainText(group);
  }
  await expect(owner.page.getByRole("list", { name: "Food categories" })).toContainText(
    "Groceries"
  );
  await expect(owner.page.getByRole("button", { name: "Use suggested categories" })).toBeHidden();

  const member = await newPerson(browser);
  await member.page.getByRole("tab", { name: "Join" }).click();
  await member.page.getByLabel("Household Code").fill(code);
  await member.page.getByRole("button", { name: "Send request" }).click();
  await owner.page.goto("/settings?open=join-requests");
  await owner.page
    .getByRole("region", { name: "Join requests" })
    .getByRole("listitem")
    .filter({ hasText: member.email })
    .getByRole("button", { name: "Accept" })
    .click();
  await expect(member.page).toHaveURL((url) => url.pathname === "/", { timeout: 15_000 });

  await member.page.goto("/categories");
  await expect(async () => {
    await member.page.reload();
    await expect(groupsList(member.page)).toContainText("Getting Around", { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });

  const addGroup = member.page.getByRole("form", { name: "Add a group" });
  await addGroup.getByLabel("Name").fill("My goals");
  await addGroup.getByRole("radio", { name: "Personal" }).check();
  await addGroup.getByRole("button", { name: "Add group" }).click();
  await expect(groupsList(member.page)).toContainText("My goals");

  const addCategory = member.page.getByRole("form", { name: "Add a category" });
  await addCategory.getByLabel("Name").fill("Travel fund");
  await addCategory.getByLabel("Group").click();
  await member.page.getByRole("option", { name: "My goals (Personal)" }).click();
  await addCategory.getByRole("button", { name: "Add category" }).click();
  await expect(member.page.getByRole("list", { name: "My goals categories" })).toContainText(
    "Travel fund"
  );
  // A Household category after it: once the Owner has it, they have pulled past the Personal ones.
  await addCategory.getByLabel("Name").fill("Pets");
  await addCategory.getByLabel("Group").click();
  await member.page.getByRole("option", { name: "Bills", exact: true }).click();
  await addCategory.getByRole("button", { name: "Add category" }).click();
  await expect(member.page.getByRole("list", { name: "Bills categories" })).toContainText("Pets");

  await owner.page.goto("/categories");
  await expect(async () => {
    await owner.page.reload();
    await expect(owner.page.getByRole("list", { name: "Bills categories" })).toContainText("Pets", {
      timeout: 2_000,
    });
  }).toPass({ timeout: 20_000 });
  await expect(groupsList(owner.page)).not.toContainText("My goals");
  await expect(groupsList(owner.page)).not.toContainText("Travel fund");

  await owner.context.close();
  await member.context.close();
});
