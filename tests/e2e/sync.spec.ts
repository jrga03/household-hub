import { test, expect } from "@playwright/test";

test.describe("Multi-Device Sync", () => {
  test("should handle concurrent edits with field-level merge", async ({ browser }) => {
    // Create two browser contexts (simulate two devices)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Login on both devices
    await page1.goto("/login");
    await page1.fill('[name="email"]', "test@example.com");
    await page1.fill('[name="password"]', "TestPassword123!");
    await page1.click('button[type="submit"]');

    await page2.goto("/login");
    await page2.fill('[name="email"]', "test@example.com");
    await page2.fill('[name="password"]', "TestPassword123!");
    await page2.click('button[type="submit"]');

    // Both navigate to same transaction
    await page1.goto("/transactions");
    await page2.goto("/transactions");

    const firstTransaction = page1.locator('[data-testid="transaction-row"]').first();
    await firstTransaction.click();
    await page1.click("text=Edit");

    await page2.locator('[data-testid="transaction-row"]').first().click();
    await page2.click("text=Edit");

    // Both go offline
    await context1.setOffline(true);
    await context2.setOffline(true);

    // Device 1 changes amount
    await page1.fill('[name="amount"]', "2000");
    await page1.click('button[type="submit"]');

    // Device 2 changes description
    await page2.fill('[name="description"]', "Updated from device 2");
    await page2.click('button[type="submit"]');

    // Both go online
    await context1.setOffline(false);
    await context2.setOffline(false);

    // Wait for sync (look for sync indicator)
    await page1.waitForSelector('[data-testid="sync-complete"]', { timeout: 5000 });
    await page2.waitForSelector('[data-testid="sync-complete"]', { timeout: 5000 });

    // Reload both pages
    await page1.reload();
    await page2.reload();

    // Open transaction again on both
    await page1.locator('[data-testid="transaction-row"]').first().click();
    await page2.locator('[data-testid="transaction-row"]').first().click();

    // Both should have merged changes (field-level merge)
    const amount1 = await page1.locator('[data-testid="transaction-amount"]').textContent();
    const description1 = await page1
      .locator('[data-testid="transaction-description"]')
      .textContent();

    const amount2 = await page2.locator('[data-testid="transaction-amount"]').textContent();
    const description2 = await page2
      .locator('[data-testid="transaction-description"]')
      .textContent();

    // Verify both devices converged to same state
    expect(amount1).toBe("₱2,000.00");
    expect(description1).toContain("Updated from device 2");
    expect(amount2).toBe("₱2,000.00");
    expect(description2).toContain("Updated from device 2");

    // Cleanup
    await context1.close();
    await context2.close();
  });

  test("should sync new transaction from one device to another", async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Login both devices
    await page1.goto("/login");
    await page1.fill('[name="email"]', "test@example.com");
    await page1.fill('[name="password"]', "TestPassword123!");
    await page1.click('button[type="submit"]');

    await page2.goto("/login");
    await page2.fill('[name="email"]', "test@example.com");
    await page2.fill('[name="password"]', "TestPassword123!");
    await page2.click('button[type="submit"]');

    // Device 1 creates new transaction
    await page1.goto("/transactions");
    await page1.click("text=Add Transaction");
    await page1.fill('[name="description"]', "Sync Test Transaction");
    await page1.fill('[name="amount"]', "999");
    await page1.selectOption('[name="type"]', "expense");
    await page1.click('button[type="submit"]');

    // Wait for device 1 to sync
    await page1.waitForSelector('[data-testid="sync-complete"]', { timeout: 5000 });

    // Device 2 should receive the new transaction via realtime
    await page2.goto("/transactions");
    await page2.waitForTimeout(2000); // Wait for realtime subscription

    // Verify transaction appears on device 2
    await expect(page2.getByText("Sync Test Transaction")).toBeVisible();

    // Cleanup
    await context1.close();
    await context2.close();
  });
});
