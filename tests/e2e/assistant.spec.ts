import { test, expect, type Page, type Route } from "@playwright/test";
import { chooseOption, navigateTo, signUpNewPerson } from "./fixtures/helpers";

// Set by the pretest:e2e scripts; nothing answers there except the stub below.
const ASSISTANT_URL = "https://assistant.e2e.test/";

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

test("a line typed to the assistant is recorded after Confirm", async ({ page }) => {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Assistant home");
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

  await navigateTo(page, "Transactions");
  const row = page
    .getByRole("list", { name: "Transactions" })
    .getByRole("listitem")
    .filter({ hasText: "Jollibee" });
  await expect(row).toContainText("₱250.00");
  await expect(row).toContainText("Groceries");
});
