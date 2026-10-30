import { test, expect } from "@playwright/test";
import { navigateTo, signUpNewPerson } from "./fixtures/helpers";

test("Reports opens from the nav, switches the period and steps the end month back", async ({
  page,
}) => {
  await signUpNewPerson(page);
  await page.getByLabel("Household name").fill("Reports home");
  await page.getByRole("button", { name: "Create household" }).click();
  await expect(page).toHaveURL(/\/$/);
  // October 2026 is the first month of data, so the end month needs a later today to step back.
  await page.clock.setFixedTime(new Date("2026-12-15T10:00:00"));
  await page.reload();

  await navigateTo(page, "Reports");
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole("region", { name: "Spending, Dec 2026" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next month" })).toBeDisabled();

  await page.getByRole("radio", { name: "3 months" }).click();
  await expect(page).toHaveURL(/period=3m/);
  await expect(page.getByRole("region", { name: "Spending, Oct – Dec 2026" })).toBeVisible();

  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page).toHaveURL(/end=2026-11/);
  await expect(page.getByRole("region", { name: "Spending, Oct – Nov 2026" })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("region", { name: "Spending, Oct – Dec 2026" })).toBeVisible();
});
