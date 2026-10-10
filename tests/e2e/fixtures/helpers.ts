import type { Page } from "@playwright/test";
import { testUsers } from "./test-users";

export async function login(page: Page, userKey: "primary" | "secondary" = "primary") {
  await loginAs(page, testUsers[userKey]);
}

export async function loginAs(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.fill('[name="email"]', user.email);
  await page.fill('[name="password"]', user.password);
  await page.click('button[type="submit"]');

  // Wait for redirect away from /login to the home page
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** Signs up a fresh person, who belongs to no household. */
export async function signUpNewPerson(page: Page) {
  const person = {
    email: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    password: "TestPassword123!",
  };
  await page.goto("/signup");
  await page.fill('[name="email"]', person.email);
  await page.fill('[name="password"]', person.password);
  await page.fill('[name="confirmPassword"]', person.password);
  await page.click('button[type="submit"]');
  return person;
}
