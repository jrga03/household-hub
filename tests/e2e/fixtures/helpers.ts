import type { Page } from "@playwright/test";
import { testUsers } from "./test-users";

export async function login(page: Page, userKey: "primary" | "secondary" = "primary") {
  const user = testUsers[userKey];

  await page.goto("/login");
  await page.fill('[name="email"]', user.email);
  await page.fill('[name="password"]', user.password);
  await page.click('button[type="submit"]');

  // Wait for redirect away from /login to the home page
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** Signs up a fresh person, who belongs to no household. */
export async function signUpNewPerson(page: Page) {
  await page.goto("/signup");
  await page.fill(
    '[name="email"]',
    `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  );
  await page.fill('[name="password"]', "TestPassword123!");
  await page.fill('[name="confirmPassword"]', "TestPassword123!");
  await page.click('button[type="submit"]');
}
