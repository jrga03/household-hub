import { Page } from "@playwright/test";
import { testUsers } from "./test-users";

export async function login(page: Page, userKey: "primary" | "secondary" = "primary") {
  const user = testUsers[userKey];

  await page.goto("/login");
  await page.fill('[name="email"]', user.email);
  await page.fill('[name="password"]', user.password);
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForURL(/\/(dashboard|transactions)/);
}

export async function createTestTransaction(
  page: Page,
  transaction: {
    description: string;
    amount: string;
    type: "income" | "expense";
    account?: string;
    category?: string;
  }
) {
  await page.goto("/transactions");
  await page.click("text=Add Transaction");

  await page.fill('[name="description"]', transaction.description);
  await page.fill('[name="amount"]', transaction.amount);
  await page.selectOption('[name="type"]', transaction.type);

  if (transaction.account) {
    await page.selectOption('[name="account"]', transaction.account);
  }

  if (transaction.category) {
    await page.selectOption('[name="category"]', transaction.category);
  }

  await page.click('button[type="submit"]');

  // Wait for success
  await page.waitForSelector('[data-testid="transaction-list"]');
}

export async function waitForSync(page: Page, timeout = 5000) {
  await page.waitForSelector('[data-testid="sync-complete"]', { timeout });
}
