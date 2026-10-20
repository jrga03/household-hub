import { test, expect, type Page, type Route } from "@playwright/test";
import { chooseOption, navigateTo, signUpNewPerson } from "./fixtures/helpers";

// Set by the pretest:e2e scripts; nothing answers there except the stub below.
const ASSISTANT_URL = "https://assistant.e2e.test/";

// page.route misses requests that pass through the PWA's service worker once it takes control.
test.use({ serviceWorkers: "block" });

interface StubRequest {
  messages: { role: string; content: string }[];
}

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST",
  "access-control-allow-headers": "authorization, content-type",
};

const sse = (...deltas: unknown[]) =>
  [
    ...deltas.map((delta) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`),
    // Workers AI's closing usage summary, which has no choices.
    'data: {"response":"","usage":{"prompt_tokens":117,"completion_tokens":27}}\n\n',
    "data: [DONE]\n\n",
  ].join("");

/** Plays the model: proposes the line using the ids from the session context, then says it's done. */
async function stubAssistant(page: Page) {
  const requests: StubRequest[] = [];
  await page.route(ASSISTANT_URL, async (route: Route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    const request = route.request().postDataJSON() as StubRequest;
    requests.push(request);
    const context = request.messages[0]?.content ?? "";
    const idOf = (name: string) => new RegExp(`- (\\S+): ${name}\\n`).exec(context)?.[1];
    const body =
      request.messages.at(-1)?.role === "user" && request.messages.length === 2
        ? sse({
            tool_calls: [
              {
                index: 0,
                id: "call-1",
                type: "function",
                function: {
                  name: "add_transaction",
                  arguments: JSON.stringify({
                    amount: "250",
                    description: "Jollibee",
                    account_id: idOf("GCash"),
                    category_id: idOf("Restaurants"),
                  }),
                },
              },
            ],
          })
        : sse({ content: "Noted." });
    await route.fulfill({
      status: 200,
      headers: { ...corsHeaders, "content-type": "text/event-stream" },
      body,
    });
  });
  return requests;
}

async function setUpHousehold(page: Page, householdName: string) {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill(householdName);
  await page.getByRole("button", { name: "Create household" }).click();

  await navigateTo(page, "Accounts");
  const addAccount = page.getByRole("form", { name: "Add an account" });
  for (const name of ["BPI", "GCash"]) {
    await addAccount.getByLabel("Account name").fill(name);
    await addAccount.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByRole("list", { name: "Accounts" })).toContainText(name);
  }
  await navigateTo(page, "Categories");
  await page.getByRole("button", { name: "Use suggested categories" }).click();
  await expect(page.getByRole("list", { name: "Food categories" })).toContainText("Groceries");
}

test("a line typed to the assistant is recorded after Confirm", async ({ page, isMobile }) => {
  await setUpHousehold(page, "Assistant home");

  const requests = await stubAssistant(page);
  await navigateTo(page, "Assistant");
  await page.getByRole("textbox", { name: "Message the assistant" }).fill("jollibee 250 gcash");
  await page.getByRole("button", { name: "Send" }).click();

  const card = page.getByRole("form", { name: "Confirm transaction" });
  await expect(card).toContainText("₱250.00");
  await expect(card.getByLabel("Account")).toHaveText("GCash");
  await expect(card.getByLabel("Category")).toHaveText("Restaurants");
  await chooseOption(page, card.getByLabel("Category"), "Groceries");
  await card.getByRole("button", { name: "Confirm" }).click();
  await expect(card).toContainText("Recorded");

  // The decision goes back to the model with the member's next message.
  await page.getByRole("textbox", { name: "Message the assistant" }).fill("thanks");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("list", { name: "Conversation" })).toContainText("Noted.");
  expect(requests[0]?.messages[0]?.role).toBe("system");
  expect(requests[1]?.messages.at(-2)).toMatchObject({
    role: "tool",
    content: expect.stringContaining("Groceries") as unknown,
  });

  // The assistant has no tab bar on phones; Back leaves it.
  if (isMobile) await page.goBack();
  await navigateTo(page, "Transactions");
  const row = page
    .getByRole("list", { name: "Transactions" })
    .getByRole("listitem")
    .filter({ hasText: "Jollibee" });
  await expect(row).toContainText("₱250.00");
  await expect(row).toContainText("Groceries");
});

test("a message that fails to send goes back in the input and is sent once", async ({ page }) => {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Assistant retry home");
  await page.getByRole("button", { name: "Create household" }).click();

  const requests: StubRequest[] = [];
  await page.route(ASSISTANT_URL, async (route: Route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    requests.push(route.request().postDataJSON() as StubRequest);
    await route.fulfill(
      requests.length === 1
        ? { status: 502, headers: corsHeaders, json: { error: "upstream" } }
        : {
            status: 200,
            headers: { ...corsHeaders, "content-type": "text/event-stream" },
            body: sse({ content: "Hello!" }),
          }
    );
  });

  await navigateTo(page, "Assistant");
  const input = page.getByRole("textbox", { name: "Message the assistant" });
  await input.fill("hi");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Couldn't reach the assistant. Try again.")).toBeVisible();
  await expect(input).toHaveValue("hi");
  await expect(page.getByRole("list", { name: "Conversation" })).not.toContainText("hi");

  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("list", { name: "Conversation" })).toContainText("Hello!");
  expect(requests[1]?.messages.filter((message) => message.role === "user")).toEqual([
    { role: "user", content: "hi" },
  ]);
});

test("a waiting proposal survives a reload and records once after Confirm", async ({
  page,
  isMobile,
}) => {
  await setUpHousehold(page, "Assistant reload home");
  await stubAssistant(page);
  await navigateTo(page, "Assistant");
  await page.getByRole("textbox", { name: "Message the assistant" }).fill("jollibee 250 gcash");
  await page.getByRole("button", { name: "Send" }).click();
  const card = page.getByRole("form", { name: "Confirm transaction" });
  await expect(card).toContainText("₱250.00");

  await page.reload();

  await expect(page.getByRole("list", { name: "Conversation" })).toContainText(
    "jollibee 250 gcash"
  );
  await expect(card).toContainText("₱250.00");
  await card.getByRole("button", { name: "Confirm" }).click();
  await expect(card).toContainText("Recorded");

  await page.reload();
  await expect(card).toContainText("Recorded");
  await expect(card.getByRole("button", { name: "Confirm" })).toHaveCount(0);

  // The assistant has no tab bar on phones; Back leaves it.
  if (isMobile) await page.goBack();
  await navigateTo(page, "Transactions");
  await expect(
    page
      .getByRole("list", { name: "Transactions" })
      .getByRole("listitem")
      .filter({ hasText: "Jollibee" })
  ).toHaveCount(1);
});

test.describe("on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, "the tab bar and the floating Add button are phone-only");

  test("the composer is pinned to the bottom edge, with no tab bar or Add button", async ({
    page,
  }) => {
    await signUpNewPerson(page);
    await page.getByLabel("Household name").fill("Assistant phone home");
    await page.getByRole("button", { name: "Create household" }).click();
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();

    await navigateTo(page, "Assistant");

    const input = page.getByRole("textbox", { name: "Message the assistant" });
    await expect(input).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add transaction" })).toHaveCount(0);
    const inputBox = await input.boundingBox();
    const viewport = page.viewportSize();
    expect(inputBox && viewport && viewport.height - (inputBox.y + inputBox.height)).toBeLessThan(
      32
    );
  });
});
