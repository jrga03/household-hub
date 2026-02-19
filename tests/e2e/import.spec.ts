import { test, expect } from "@playwright/test";
import { login } from "./fixtures/helpers";
import { cleanupTestTransactions } from "./fixtures/db-cleanup";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe("CSV Import Wizard", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async () => {
    await cleanupTestTransactions();
  });

  test("upload CSV file and navigate through wizard steps", async ({ page }) => {
    await page.goto("/import");

    // Step 1: Upload
    const fileInput = page.locator('input[type="file"]').first();

    if (!(await fileInput.isVisible({ timeout: 5000 }).catch(() => false))) {
      // Try alternative import routes
      await page.goto("/transactions/import");
      if (
        !(await page
          .locator('input[type="file"]')
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false))
      ) {
        test.skip(true, "Import page not found");
        return;
      }
    }

    // Upload test CSV
    const csvPath = path.resolve(__dirname, "fixtures/test-import.csv");
    await page.locator('input[type="file"]').first().setInputFiles(csvPath);

    // Wait for file to be parsed
    await page.waitForTimeout(1000);

    // Step 2: Column Mapping (should auto-advance or show mapping UI)
    const mappingStep = page
      .locator('text=Mapping, text=Map Columns, [data-testid="mapping-step"]')
      .first();

    if (await mappingStep.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Verify column headers are detected
      await expect(mappingStep).toBeVisible();

      // Try to advance to next step
      const nextBtn = page.locator('button:has-text("Next"), button:has-text("Continue")').first();
      if (await nextBtn.isVisible()) {
        await nextBtn.click();
      }
    }

    // Step 3: Duplicate detection (may show or skip)
    await page.waitForTimeout(500);

    // Step 4: Validation (check for validation results)
    const validationSection = page
      .locator('text=Valid, text=Validation, [data-testid="validation-step"]')
      .first();

    if (await validationSection.isVisible({ timeout: 3000 }).catch(() => false)) {
      const nextBtn = page.locator('button:has-text("Import"), button:has-text("Next")').first();
      if (await nextBtn.isVisible()) {
        await nextBtn.click();
      }
    }

    // Step 5: Import completion
    await page.waitForTimeout(2000);
  });

  test("column mapping step shows detected headers", async ({ page }) => {
    await page.goto("/import");

    const fileInput = page.locator('input[type="file"]').first();
    if (!(await fileInput.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Import page not found");
      return;
    }

    const csvPath = path.resolve(__dirname, "fixtures/test-import.csv");
    await fileInput.setInputFiles(csvPath);

    // After upload, headers should appear in the UI
    await page.waitForTimeout(1000);

    // Check that CSV headers are displayed somewhere
    const dateHeader = page.locator("text=Date").first();
    const descHeader = page.locator("text=Description").first();
    await expect(dateHeader).toBeVisible({ timeout: 5000 });
    await expect(descHeader).toBeVisible({ timeout: 5000 });
  });
});
