// PROTOTYPE (#177): screenshots of each Budget header variant. Never merge to main.
import { test } from "@playwright/test";
import { loginAs } from "../fixtures/helpers";

const OUT = process.env.PROTO_OUT ?? "proto-shots";

for (const variant of ["A", "B", "C", "D"]) {
  for (const month of ["", "2025-08"]) {
    test(`budget header ${variant} ${month || "this-month"}`, async ({ page }) => {
      await loginAs(page, { email: "proto177@example.com", password: "TestPassword123!" });
      const query = `variant=${variant}${month ? `&month=${month}` : ""}`;
      await page.goto(`/budget?${query}`);
      await page.getByRole("banner").getByRole("heading", { level: 1 }).waitFor();
      await page.waitForLoadState("networkidle");
      const h1 = page.getByRole("banner").getByRole("heading", { level: 1 });
      const fits = await h1.evaluate((el) => `${el.scrollWidth}<=${el.clientWidth}`);
      console.log(`VARIANT ${variant} ${month || "now"} h1 ${fits}`);
      await page.screenshot({
        path: `${OUT}/${variant}-${month || "now"}.png`,
        clip: { x: 0, y: 0, width: 393, height: 851 },
      });
    });
  }
}
