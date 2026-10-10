import { test, expect, type Page } from "@playwright/test";
import { loginAs, signUpNewPerson } from "./fixtures/helpers";

// A fresh person per run: events are append-only, so accounts made by the
// fixture users would pile up across runs.
async function addAccount(page: Page, name: string, startingBalance: string) {
  const form = page.getByRole("form", { name: "Add an account" });
  await form.getByLabel("Account name").fill(name);
  await form.getByLabel("Type").click();
  await page.getByRole("option", { name: "E-wallet" }).click();
  await form.getByLabel("Starting balance (₱)").fill(startingBalance);
  await form.getByRole("button", { name: "Add account" }).click();
}

const accountsList = (page: Page) => page.getByRole("list", { name: "Accounts" });

test("an account added offline on one device appears on the member's other devices", async ({
  browser,
}) => {
  const deviceA = await browser.newContext();
  const pageA = await deviceA.newPage();
  const person = await signUpNewPerson(pageA);
  await pageA.getByLabel("Household name").fill("Sync home");
  await pageA.getByRole("button", { name: "Create household" }).click();
  await expect(pageA.getByText("No accounts yet")).toBeVisible();

  const deviceB = await browser.newContext();
  const pageB = await deviceB.newPage();
  await loginAs(pageB, person);
  await expect(pageB.getByText("No accounts yet")).toBeVisible();

  await deviceA.setOffline(true);
  await addAccount(pageA, "GCash", "250.50");
  await expect(accountsList(pageA)).toContainText("GCash");
  await expect(accountsList(pageA)).toContainText("₱250.50");

  await deviceA.setOffline(false);

  // B was open the whole time: reconnecting makes it pull.
  await expect(async () => {
    await deviceB.setOffline(true);
    await deviceB.setOffline(false);
    await expect(accountsList(pageB)).toContainText("GCash", { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(accountsList(pageB)).toContainText("E-wallet");
  await expect(accountsList(pageB)).toContainText("₱250.50");

  // A device signing in later pulls it on app start.
  const deviceC = await browser.newContext();
  const pageC = await deviceC.newPage();
  await loginAs(pageC, person);
  await expect(accountsList(pageC)).toContainText("GCash");

  await Promise.all([deviceA.close(), deviceB.close(), deviceC.close()]);
});
