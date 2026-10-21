import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login, navigateTo, openSettingsSection, signUpNewPerson } from "./fixtures/helpers";

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
    await expect(
      page.getByRole("banner").getByRole("heading", { name: "Acido home" })
    ).toBeVisible();

    await navigateTo(page, "Settings");
    const household = await openSettingsSection(page, "Household");
    await expect(household.getByText("Acido home")).toBeVisible();
    await expect(household.getByText("Owner", { exact: true })).toBeVisible();
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
    // The choices wait for the Join Request lookup; going offline before it answers leaves none.
    await expect(page.getByLabel("Household name")).toBeVisible();

    await context.setOffline(true);

    const create = page.getByRole("button", { name: "Create household" });
    await expect(create).toBeDisabled();
    await expect(create).toHaveAccessibleDescription(/needs a connection/);

    await context.setOffline(false);
    await expect(create).toBeEnabled();
  });

  test("content clears the status bar and home indicator, with Sign Out pinned at the bottom", async ({
    page,
  }) => {
    // iPhone 15 Pro insets (Dynamic Island, home indicator); browsers outside a notched
    // device report zero for env(safe-area-inset-*), so the test supplies them.
    const SAFE_TOP = 59;
    const SAFE_BOTTOM = 34;
    await page.setViewportSize({ width: 393, height: 852 });
    await signUpNewPerson(page);
    await expect(page).toHaveURL(/\/create-or-join/);
    await page.addStyleTag({
      content: `:root { --safe-area-top: ${SAFE_TOP}px; --safe-area-bottom: ${SAFE_BOTTOM}px; }`,
    });

    const heading = page.getByRole("heading", { name: "Welcome to Household Hub" });
    await expect(page.getByText(/Everything you record belongs/)).toHaveCount(0);
    const headingBox = await heading.boundingBox();
    expect(headingBox?.y).toBeGreaterThanOrEqual(SAFE_TOP);

    const signOut = page.getByRole("button", { name: "Sign Out" });
    const signOutBox = await signOut.boundingBox();
    if (!signOutBox) throw new Error("Sign Out is not rendered");
    const viewportHeight = 852;
    expect(signOutBox.y + signOutBox.height).toBeLessThanOrEqual(viewportHeight - SAFE_BOTTOM);
    // Pinned: it sits in the bottom band of the screen, not under the form.
    expect(signOutBox.y).toBeGreaterThan(viewportHeight - SAFE_BOTTOM - 80);
  });

  test("a member reaching create-or-join is sent home", async ({ page }) => {
    await login(page);
    await page.goto("/create-or-join");

    await expect(page).toHaveURL((url) => url.pathname === "/");
  });
});
