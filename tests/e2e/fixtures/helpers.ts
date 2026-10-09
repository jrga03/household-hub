import type { Page } from "@playwright/test";
import { testUsers } from "./test-users";

export async function login(page: Page, userKey: "primary" | "secondary" = "primary") {
  const user = testUsers[userKey];

  await page.goto("/login");
  await page.fill('[name="email"]', user.email);
  await page.fill('[name="password"]', user.password);
  await page.click('button[type="submit"]');

  // Wait for redirect away from /login (dashboard is at "/", legacy /dashboard redirects to "/")
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}
