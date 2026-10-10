import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login, signUpNewPerson } from "./fixtures/helpers";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

test.describe("Create a household", () => {
  test("a new person creates a household and sees the Owner view with the code", async ({
    page,
  }) => {
    await signUpNewPerson(page);
    await expect(page).toHaveURL(/\/create-or-join/);

    // Every other route sends them back
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/create-or-join/);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toHaveLength(0);

    await page.getByLabel("Household name").fill("Acido home");
    await page.getByRole("button", { name: "Create household" }).click();

    await expect(page).toHaveURL((url) => url.pathname === "/");
    const main = page.getByRole("main");
    await expect(main.getByText("Acido home")).toBeVisible();
    await expect(main.getByText("Owner", { exact: true })).toBeVisible();
    await expect(page.getByTestId("household-code")).toHaveText(
      /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/
    );
  });

  test("offline, the create button explains that it needs a connection", async ({
    page,
    context,
  }) => {
    await signUpNewPerson(page);
    await expect(page).toHaveURL(/\/create-or-join/);

    await context.setOffline(true);

    const create = page.getByRole("button", { name: "Create household" });
    await expect(create).toBeDisabled();
    await expect(create).toHaveAccessibleDescription(/needs a connection/);

    await context.setOffline(false);
    await expect(create).toBeEnabled();
  });

  test("a member reaching create-or-join is sent home", async ({ page }) => {
    await login(page);
    await page.goto("/create-or-join");

    await expect(page).toHaveURL((url) => url.pathname === "/");
  });
});
