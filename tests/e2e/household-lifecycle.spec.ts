import { test, expect, type Browser, type Page } from "@playwright/test";
import { signUpNewPerson } from "./fixtures/helpers";

// Fresh people per run: membership is one household per person.
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

/** Account names in the device's local store, whatever the screen shows. */
const localAccountNames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const request = window.indexedDB.open("household-hub");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const read = request.result.transaction("accounts").objectStore("accounts").getAll();
          read.onerror = () => reject(read.error);
          read.onsuccess = () => {
            request.result.close();
            resolve((read.result as { name: string }[]).map((account) => account.name).sort());
          };
        };
      })
  );

test("a removed Member's next sync drops the household's accounts and keeps their Personal one", async ({
  browser,
}) => {
  const owner = await newPerson(browser);
  await owner.page.getByLabel("Household name").fill("Lifecycle home");
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

  await addAccount(member.page, "B wallet", "Personal");
  await addAccount(member.page, "Shared cash", "Household");
  await expect(async () => {
    await owner.page.reload();
    await expect(accountsList(owner.page)).toContainText("Shared cash", { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  expect(await localAccountNames(member.page)).toEqual(["B wallet", "Shared cash"]);

  // Only the Owner sees the controls.
  const membersOnMemberPage = member.page.getByRole("region", { name: "Members" });
  await expect(membersOnMemberPage).toContainText(owner.email);
  await expect(membersOnMemberPage.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
  await expect(member.page.getByRole("button", { name: "Replace code" })).toHaveCount(0);

  await owner.page.getByRole("button", { name: `Remove ${member.email}` }).click();
  await owner.page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await expect(owner.page.getByRole("region", { name: "Members" })).not.toContainText(member.email);

  // The member's device notices at its next sync, here when the page becomes visible again.
  await member.page.evaluate(() => document.dispatchEvent(new window.Event("visibilitychange")));
  await expect(member.page).toHaveURL((url) => url.pathname === "/create-or-join", {
    timeout: 15_000,
  });
  await expect(
    member.page.getByRole("heading", { name: "Welcome to Household Hub" })
  ).toBeVisible();
  await expect.poll(() => localAccountNames(member.page)).toEqual(["B wallet"]);

  // What the departed Member recorded stays with the household.
  await owner.page.reload();
  await expect(accountsList(owner.page)).toContainText("Shared cash");

  await Promise.all([owner.context.close(), member.context.close()]);
});
