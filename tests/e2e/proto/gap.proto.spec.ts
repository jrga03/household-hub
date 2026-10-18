// PROTOTYPE (#177): measures the space above the first budget group. Never merge to main.
import { test } from "@playwright/test";
import { loginAs } from "../fixtures/helpers";

const OUT = process.env.PROTO_OUT ?? "proto-shots";

for (const variant of ["A", "B", "C", "D"]) {
  test(`gap ${variant}`, async ({ page }, info) => {
    await loginAs(page, { email: "proto177@example.com", password: "TestPassword123!" });
    await page.goto(`/budget?variant=${variant}`);
    const bills = page.getByText("Bills", { exact: true }).first();
    await bills.waitFor();
    const banner = await page.getByRole("banner").boundingBox();
    const box = await bills.boundingBox();
    console.log(`GAP ${info.project.name} ${variant} header-bottom=${banner && banner.y + banner.height} bills-top=${box?.y}`);
    await page.screenshot({ path: `${OUT}/gap-${info.project.name.replace(" ", "")}-${variant}.png` });
  });
}
