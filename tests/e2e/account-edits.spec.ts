import { test, expect, type Page } from "@playwright/test";
import { loginAs, signUpNewPerson } from "./fixtures/helpers";

const accountsList = (page: Page) => page.getByRole("list", { name: "Accounts" });

async function renameAccount(page: Page, from: string, to: string) {
  await page.getByRole("button", { name: `Edit ${from}` }).click();
  const form = page.getByRole("form", { name: "Edit account" });
  await form.getByLabel("Account name").fill(to);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(accountsList(page)).toContainText(to);
}

/** Reconnecting is a sync trigger; repeat until the device has pulled the other's events. */
async function expectAfterSync(page: Page, synced: () => Promise<void>) {
  await expect(async () => {
    await page.context().setOffline(true);
    await page.context().setOffline(false);
    await synced();
  }).toPass({ timeout: 20_000 });
}

const listed = (page: Page, name: string) => () =>
  expect(accountsList(page)).toContainText(name, { timeout: 2_000 });

test("two devices rename the same account offline and both end on the later edit", async ({
  browser,
}) => {
  const deviceA = await browser.newContext();
  const pageA = await deviceA.newPage();
  const person = await signUpNewPerson(pageA);
  await pageA.getByLabel("Household name").fill("Edit home");
  await pageA.getByRole("button", { name: "Create household" }).click();
  const addForm = pageA.getByRole("form", { name: "Add an account" });
  await addForm.getByLabel("Account name").fill("Cash");
  await addForm.getByRole("button", { name: "Add account" }).click();
  await expect(accountsList(pageA)).toContainText("Cash");

  const deviceB = await browser.newContext();
  const pageB = await deviceB.newPage();
  await loginAs(pageB, person);
  await expectAfterSync(pageB, listed(pageB, "Cash"));

  await deviceA.setOffline(true);
  await deviceB.setOffline(true);
  await renameAccount(pageA, "Cash", "Wallet on A");
  await renameAccount(pageB, "Cash", "Wallet on B");

  await deviceA.setOffline(false);
  await deviceB.setOffline(false);
  await expectAfterSync(pageB, listed(pageB, "Wallet on B"));
  await expectAfterSync(pageA, listed(pageA, "Wallet on B"));
  await expect(accountsList(pageA)).not.toContainText("Wallet on A");
  await expect(accountsList(pageB)).not.toContainText("Wallet on A");

  // Retiring moves it out of the main list; it can be brought back.
  await pageA.getByRole("button", { name: "Edit Wallet on B" }).click();
  await pageA.getByRole("button", { name: "Retire account" }).click();
  await expect(accountsList(pageA)).toHaveCount(0);
  await expectAfterSync(pageB, () =>
    expect(accountsList(pageB)).toHaveCount(0, { timeout: 2_000 })
  );
  await expect(pageB.getByRole("button", { name: /Show retired accounts/ })).toBeVisible();
  await pageA.getByRole("button", { name: /Show retired accounts/ }).click();
  await pageA.getByRole("button", { name: "Unretire Wallet on B" }).click();
  await expect(accountsList(pageA)).toContainText("Wallet on B");
  await expect(accountsList(pageA)).toContainText("₱0.00");

  await Promise.all([deviceA.close(), deviceB.close()]);
});
