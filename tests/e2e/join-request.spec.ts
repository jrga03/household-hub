import { test, expect, type Browser, type Page } from "@playwright/test";
import { signUpNewPerson } from "./fixtures/helpers";

// Fresh people per run: membership is one household per person, so the
// fixture users (who already have one) can't request.
async function newOwner(browser: Browser, householdName: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill(householdName);
  await page.getByRole("button", { name: "Create household" }).click();
  const code = await page.getByTestId("household-code").textContent();
  if (!code) throw new Error("The Owner sees no Household Code");
  return { context, page, code };
}

async function newRequester(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const person = await signUpNewPerson(page);
  await expect(page).toHaveURL(/\/create-or-join/);
  return { context, page, email: person.email };
}

async function requestToJoin(page: Page, code: string) {
  await page.getByLabel("Household Code").fill(code);
  await page.getByRole("button", { name: "Send request" }).click();
}

const joinRequests = (page: Page) => page.getByRole("region", { name: "Join requests" });

test("an Owner accepts a Join Request and the requester lands in the household", async ({
  browser,
}) => {
  const owner = await newOwner(browser, "Join home");
  const requester = await newRequester(browser);

  await requestToJoin(requester.page, owner.code.toLowerCase());
  await expect(requester.page.getByRole("heading", { name: "Request sent" })).toBeVisible();

  await owner.page.reload();
  const request = joinRequests(owner.page).getByRole("listitem").filter({
    hasText: requester.email,
  });
  await request.getByRole("button", { name: "Accept" }).click();
  await expect(joinRequests(owner.page)).toContainText("No pending requests");

  await expect(requester.page).toHaveURL((url) => url.pathname === "/", { timeout: 15_000 });
  const main = requester.page.getByRole("main");
  await expect(main.getByText("Join home")).toBeVisible();
  await expect(main.getByText("Member", { exact: true })).toBeVisible();
  await expect(joinRequests(requester.page)).toHaveCount(0);

  await Promise.all([owner.context.close(), requester.context.close()]);
});

test("a requester cancels a pending request, and an unknown code is explained", async ({
  browser,
}) => {
  const owner = await newOwner(browser, "Cancel home");
  const requester = await newRequester(browser);

  await requestToJoin(requester.page, "ZZZZZZ");
  await expect(requester.page.getByRole("alert")).toHaveText("No household with that code");

  await requestToJoin(requester.page, owner.code);
  await requester.page.getByRole("button", { name: "Cancel request" }).click();
  await expect(requester.page.getByLabel("Household Code")).toBeVisible();

  await owner.page.reload();
  await expect(joinRequests(owner.page)).toContainText("No pending requests");

  await Promise.all([owner.context.close(), requester.context.close()]);
});

test("a declined requester is told politely and returned to create-or-join", async ({
  browser,
}) => {
  const owner = await newOwner(browser, "Decline home");
  const requester = await newRequester(browser);

  await requestToJoin(requester.page, owner.code);
  await expect(requester.page.getByRole("heading", { name: "Request sent" })).toBeVisible();

  await owner.page.reload();
  await joinRequests(owner.page)
    .getByRole("listitem")
    .filter({ hasText: requester.email })
    .getByRole("button", { name: "Decline" })
    .click();

  await expect(requester.page.getByText(/wasn.t accepted/)).toBeVisible({ timeout: 15_000 });
  await requester.page.getByRole("button", { name: "OK" }).click();
  await expect(requester.page.getByLabel("Household Code")).toBeVisible();
  await expect(requester.page.getByLabel("Household name")).toBeVisible();

  await Promise.all([owner.context.close(), requester.context.close()]);
});
