import { test, expect, type Browser, type Page } from "@playwright/test";
import { navigateTo, signUpNewPerson } from "./fixtures/helpers";

async function startHousehold(page: Page, name: string) {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill(name);
  await page.getByRole("button", { name: "Create household" }).click();
  await navigateTo(page, "Accounts");
  const addAccount = page.getByRole("form", { name: "Add an account" });
  await addAccount.getByLabel("Account name").fill("BPI");
  await addAccount.getByLabel("Starting balance (₱)").fill("10000");
  await addAccount.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("main").getByText("BPI")).toBeVisible();
}

async function addUncategorizedExpense(page: Page, description: string) {
  await page.keyboard.press("n");
  const dialog = page.getByRole("dialog", { name: "Add transaction" });
  await dialog.getByLabel("Amount (₱)").fill("250");
  await dialog.getByLabel("Description", { exact: true }).fill(description);
  await dialog.getByRole("button", { name: "Add transaction" }).click();
  await expect(dialog).toBeHidden();
}

test("Review is all clear, then counts an expense without a category everywhere", async ({
  page,
  isMobile,
}) => {
  await startHousehold(page, "Review home");

  await page.goto("/review");
  await expect(page.getByRole("heading", { name: "All clear" })).toBeVisible();

  await addUncategorizedExpense(page, "Lunch");

  await navigateTo(page, "Home");
  const banner = page.getByRole("main").getByRole("link", { name: "1 item to review" });
  await expect(banner).toBeVisible();

  if (isMobile) {
    const menu = page.getByRole("button", { name: "Open navigation menu, 1 to review" });
    await expect(menu.getByTestId("review-dot")).toBeVisible();
    await menu.click();
    await expect(
      page.getByRole("dialog").getByRole("link", { name: "Review, 1 to review" })
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  } else {
    await expect(
      page.getByRole("link", { name: "Review, 1 to review", exact: true })
    ).toBeVisible();
  }

  await banner.click();
  await expect(page).toHaveURL(/\/review$/);
  const section = page.getByRole("region", { name: "Expenses without a category" });
  await expect(section).toContainText("1 expense has no category yet.");

  await section.getByRole("link", { name: "Categorize" }).click();
  await expect(page).toHaveURL(/\/transactions\?needsCategory=true/);
  await expect(page.getByRole("main").getByText("Lunch")).toBeVisible();
});

async function newRequester(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const person = await signUpNewPerson(page);
  await expect(page).toHaveURL(/\/create-or-join/);
  return { context, page, email: person.email };
}

test("an Owner answers a Join Request from Review", async ({ page, browser }) => {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Review join home");
  await page.getByRole("button", { name: "Create household" }).click();
  await page.goto("/settings?open=household");
  const code = await page.getByTestId("household-code").textContent();
  if (!code) throw new Error("The Owner sees no Household Code");

  const requester = await newRequester(browser);
  await requester.page.getByRole("tab", { name: "Join" }).click();
  await requester.page.getByLabel("Household Code").fill(code);
  await requester.page.getByRole("button", { name: "Send request" }).click();
  await expect(requester.page.getByRole("heading", { name: "Request sent" })).toBeVisible();

  await page.goto("/review");
  const section = page.getByRole("region", { name: "Join requests" });
  const request = section.getByRole("listitem").filter({ hasText: requester.email });
  await request.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByRole("heading", { name: "All clear" })).toBeVisible();

  await expect(requester.page).toHaveURL((url) => url.pathname === "/", { timeout: 15_000 });
  await requester.context.close();
});
