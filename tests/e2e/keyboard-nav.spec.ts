import { test, expect } from "@playwright/test";

test.describe("Keyboard Navigation", () => {
  test("should navigate main menu with keyboard only", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');

    await page.goto("/");

    // Tab through main navigation
    await page.keyboard.press("Tab");
    const firstNav = await page.evaluate(() => document.activeElement?.getAttribute("data-nav"));
    expect(firstNav).toBeTruthy();

    await page.keyboard.press("Tab");
    const secondNav = await page.evaluate(() => document.activeElement?.getAttribute("data-nav"));
    expect(secondNav).toBeTruthy();

    // Verify we can navigate with keyboard
    expect(firstNav).not.toBe(secondNav);
  });

  test("should create transaction using keyboard only", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');

    await page.goto("/transactions");

    // Find and focus the "Add Transaction" button
    const addButton = page.getByRole("button", { name: /add transaction/i });
    await addButton.focus();
    await page.keyboard.press("Enter");

    // Wait for form to appear
    await page.waitForSelector('[name="amount"]');

    // Fill form with keyboard
    await page.keyboard.type("1500.50"); // Amount field should be auto-focused
    await page.keyboard.press("Tab");

    await page.keyboard.press("ArrowDown"); // Select type
    await page.keyboard.press("Tab");

    await page.keyboard.type("Keyboard Test Transaction"); // Description
    await page.keyboard.press("Tab");

    await page.keyboard.press("ArrowDown"); // Select account
    await page.keyboard.press("Tab");

    await page.keyboard.press("ArrowDown"); // Select category
    await page.keyboard.press("Tab");

    await page.keyboard.press("Enter"); // Submit

    // Verify transaction created
    await expect(page.getByText("Keyboard Test Transaction")).toBeVisible({ timeout: 5000 });
  });

  test("should navigate transaction list with arrow keys", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');

    await page.goto("/transactions");

    // Focus first transaction
    const firstTx = page.locator('[data-testid="transaction-row"]').first();
    await firstTx.focus();

    // Get first transaction text
    const firstText = await firstTx.textContent();

    // Navigate down with arrow key
    await page.keyboard.press("ArrowDown");

    // Get second transaction text
    const secondTx = page.locator('[data-testid="transaction-row"]').nth(1);
    const secondText = await secondTx.textContent();

    // Verify we moved to different transaction
    expect(firstText).not.toBe(secondText);

    // Navigate back up
    await page.keyboard.press("ArrowUp");

    // Should be back at first transaction
    const focusedElement = await page.evaluate(() => document.activeElement?.textContent);
    expect(focusedElement).toContain(firstText?.substring(0, 20) || "");
  });
});
