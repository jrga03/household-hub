import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import {
  chooseOption,
  loginAs,
  signUpNewPerson,
  navigateTo,
  openAccount,
} from "./fixtures/helpers";

// Anchored: a card's row also names its Paying Account.
const accountItem = (page: Page, name: string) =>
  page
    .getByRole("list", { name: "Accounts" })
    .getByRole("listitem")
    .filter({ hasText: new RegExp(`^${name}`) });

/** A `Money`'s text: the amount shown, then the amount read aloud. */
const money = (shown: string) => `${shown}${shown.replace("−", "minus ")}`;

/** A figure in an account's detail, by the label or term before it. */
const fact = (details: Locator, label: string) =>
  details.getByText(label, { exact: true }).locator("xpath=following-sibling::*[1]");

/** Reconnecting makes an open device pull; repeat until the other device's push has landed. */
async function pullUntil(device: BrowserContext, item: Locator, text: string) {
  await expect(async () => {
    await device.setOffline(true);
    await device.setOffline(false);
    await expect(item).toContainText(text, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

test("a card purchase recorded offline reserves its amount in the Paying Account on another device", async ({
  browser,
}) => {
  const deviceA = await browser.newContext();
  const pageA = await deviceA.newPage();
  const person = await signUpNewPerson(pageA);
  await pageA.getByLabel("Household name").fill("Card Payment home");
  await pageA.getByRole("button", { name: "Create household" }).click();
  await navigateTo(pageA, "Accounts");

  const addAccount = pageA.getByRole("form", { name: "Add an account" });
  await addAccount.getByLabel("Account name").fill("BDO Savings");
  await addAccount.getByLabel("Starting balance (₱)").fill("5000");
  await addAccount.getByRole("button", { name: "Add account" }).click();
  await expect(accountItem(pageA, "BDO Savings")).toContainText("₱5,000.00");
  await addAccount.getByLabel("Account name").fill("Visa");
  await chooseOption(pageA, addAccount.getByLabel("Type"), "Credit card");
  await chooseOption(pageA, addAccount.getByLabel("Paid from"), "BDO Savings");
  await addAccount.getByRole("button", { name: "Add account" }).click();
  await expect(accountItem(pageA, "Visa")).toContainText("Paid from BDO Savings");

  await navigateTo(pageA, "Categories");
  await pageA.getByRole("button", { name: "Use suggested categories" }).click();
  await expect(pageA.getByRole("list", { name: "Food categories" })).toContainText("Restaurants");
  await navigateTo(pageA, "Accounts");

  const deviceB = await browser.newContext();
  const pageB = await deviceB.newPage();
  await loginAs(pageB, person);
  await navigateTo(pageB, "Accounts");
  await pullUntil(deviceB, accountItem(pageB, "Visa"), "Paid from BDO Savings");

  await deviceA.setOffline(true);
  await pageA.keyboard.press("n");
  const dialog = pageA.getByRole("dialog", { name: "Add transaction" });
  await dialog.getByLabel("Amount (₱)").fill("1200");
  await chooseOption(pageA, dialog.getByLabel("Account"), "Visa");
  await chooseOption(pageA, dialog.getByLabel("Category"), "Restaurants");
  await dialog.getByLabel("Description", { exact: true }).fill("Dinner");
  await dialog.getByRole("button", { name: "Add transaction" }).click();
  await expect(dialog).toBeHidden();
  const savingsA = await openAccount(pageA, "BDO Savings");
  await expect(fact(savingsA, "Card Payment · Visa")).toHaveText(money("₱1,200.00"));
  await deviceA.setOffline(false);

  await pullUntil(deviceB, accountItem(pageB, "Visa"), "₱1,200.00");
  await expect(accountItem(pageB, "BDO Savings")).toContainText("Unassigned ₱5,000.00");
  const savings = await openAccount(pageB, "BDO Savings");
  await expect(fact(savings, "Balance")).toHaveText(money("₱5,000.00"));
  await expect(fact(savings, "Unassigned")).toHaveText(money("₱5,000.00"));
  await expect(fact(savings, "Card Payment · Visa")).toHaveText(money("₱1,200.00"));

  await Promise.all([deviceA.close(), deviceB.close()]);
});

/** Presses Tab until the target has focus, as a keyboard user would. */
async function tabTo(page: Page, target: Locator, key: "Tab" | "Shift+Tab" = "Tab") {
  for (let presses = 0; presses < 60; presses++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press(key);
  }
  throw new Error("Tab never reached the target");
}

test("a card is paid and a balance corrected by keyboard alone", async ({ page }) => {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Keyboard home");
  await page.getByRole("button", { name: "Create household" }).click();
  await navigateTo(page, "Accounts");
  const addAccount = page.getByRole("form", { name: "Add an account" });
  await addAccount.getByLabel("Account name").fill("BPI");
  await addAccount.getByLabel("Starting balance (₱)").fill("5000");
  await addAccount.getByRole("button", { name: "Add account" }).click();
  await expect(accountItem(page, "BPI")).toBeVisible();
  await addAccount.getByLabel("Account name").fill("Visa");
  await chooseOption(page, addAccount.getByLabel("Type"), "Credit card");
  await chooseOption(page, addAccount.getByLabel("Paid from"), "BPI");
  await addAccount.getByRole("button", { name: "Add account" }).click();
  await expect(accountItem(page, "Visa")).toContainText("Paid from BPI");

  await page.getByRole("heading", { name: "Bank accounts" }).click();
  await tabTo(page, page.getByRole("button", { name: /^Visa/ }));
  await page.keyboard.press("Enter");
  const visa = page
    .getByRole("region", { name: "Visa", exact: true })
    .or(page.getByRole("dialog", { name: "Visa", exact: true }));
  await tabTo(page, visa.getByRole("button", { name: "Pay Visa" }));
  await page.keyboard.press("Enter");
  const pay = page.getByRole("form", { name: "Pay Visa" });
  await tabTo(page, pay.getByLabel("Amount (₱)"));
  await page.keyboard.type("300");
  await page.keyboard.press("Enter");
  await expect(pay).toBeHidden();
  await expect(page.getByText("Paid ₱300.00 to Visa")).toBeVisible();

  // A phone shows the account in a sheet over the list; Escape closes it.
  const visaSheet = page.getByRole("dialog", { name: "Visa", exact: true });
  if (await visaSheet.isVisible()) {
    await page.keyboard.press("Escape");
    await expect(visaSheet).toBeHidden();
  }
  await tabTo(page, page.getByRole("button", { name: /^BPI/ }), "Shift+Tab");
  await page.keyboard.press("Enter");
  const bpi = page
    .getByRole("region", { name: "BPI", exact: true })
    .or(page.getByRole("dialog", { name: "BPI", exact: true }));
  await tabTo(page, bpi.getByRole("button", { name: "Correct balance" }));
  await page.keyboard.press("Enter");
  const correct = page.getByRole("form", { name: "Correct BPI" });
  await tabTo(page, correct.getByLabel("Actual balance (₱)"));
  await page.keyboard.type("4500");
  await page.keyboard.press("Enter");
  await expect(correct).toBeHidden();
  await expect(page.getByText("BPI corrected to ₱4,500.00")).toBeVisible();
});
