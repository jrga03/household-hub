import { beforeEach, describe, expect, it } from "vitest";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { readPaydays } from "@/lib/paydays/projection";
import { HOUSEHOLD } from "@/test/events";
import { parsePHP } from "@/lib/currency";
import { createAccount } from "./accounts";
import { setBudget } from "./budgets";
import { createCategory, createGroup, retireCategory } from "./categories";
import {
  addPayday,
  deletePayday,
  movePayday,
  renamePayday,
  retirePayday,
  unretirePayday,
} from "./paydays";

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

const names = async () => (await readPaydays()).map((payday) => payday.name);

/** Adds Groceries; `setGroceries` budgets it from `fromMonth`, all on `paydayId`, or on any payday without one. */
async function groceriesBudget() {
  const bpi = await createAccount(MEMBER, {
    name: "BPI",
    type: "bank",
    startingBalanceCents: parsePHP("0"),
  });
  const food = await createGroup(MEMBER, { name: "Food" });
  const groceries = await createCategory(MEMBER, { name: "Groceries", groupId: food.id });
  const amountCents = parsePHP("8000");
  const set = (fromMonth: string, paydayId?: string) =>
    setBudget(
      MEMBER,
      {
        categoryId: groceries.id,
        amountCents,
        accountId: bpi.id,
        fromMonth,
        portions: paydayId ? [{ paydayId, amountCents }] : [],
      },
      "2026-11"
    );
  return { groceriesId: groceries.id, setGroceries: set };
}

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("payday commands", () => {
  it("adds paydays at the end, with their names trimmed", async () => {
    await addPayday(MEMBER, "  15th salary ");
    await addPayday(MEMBER, "30th salary");

    expect(await names()).toEqual(["15th salary", "30th salary"]);
  });

  it("refuses a blank name", async () => {
    await expect(addPayday(MEMBER, "   ")).rejects.toThrow("A payday needs a name.");
    const { id } = await addPayday(MEMBER, "15th salary");
    await expect(renamePayday(MEMBER, id, "")).rejects.toThrow("A payday needs a name.");
  });

  it("renames a payday", async () => {
    const { id } = await addPayday(MEMBER, "15th");
    await renamePayday(MEMBER, id, " 15th salary ");

    expect(await names()).toEqual(["15th salary"]);
  });

  it("moves a payday up or down one place", async () => {
    await addPayday(MEMBER, "15th salary");
    await addPayday(MEMBER, "30th salary");
    const bonus = await addPayday(MEMBER, "Bonus");

    await movePayday(MEMBER, bonus.id, "up");
    expect(await names()).toEqual(["15th salary", "Bonus", "30th salary"]);

    await movePayday(MEMBER, bonus.id, "up");
    expect(await names()).toEqual(["Bonus", "15th salary", "30th salary"]);

    await movePayday(MEMBER, bonus.id, "down");
    expect(await names()).toEqual(["15th salary", "Bonus", "30th salary"]);
  });

  it("leaves the order alone when a payday can't move further", async () => {
    const first = await addPayday(MEMBER, "15th salary");
    await addPayday(MEMBER, "30th salary");

    await movePayday(MEMBER, first.id, "up");

    expect(await names()).toEqual(["15th salary", "30th salary"]);
  });

  it("deletes a payday", async () => {
    const { id } = await addPayday(MEMBER, "15th salary");
    await addPayday(MEMBER, "30th salary");

    await deletePayday(MEMBER, id);

    expect(await names()).toEqual(["30th salary"]);
    await expect(renamePayday(MEMBER, id, "Mid-month")).rejects.toThrow(
      "That payday no longer exists."
    );
  });

  it("refuses to delete a payday that any budget version names", async () => {
    const { id } = await addPayday(MEMBER, "15th salary");
    const { setGroceries } = await groceriesBudget();
    await setGroceries("2026-10", id);
    await setGroceries("2026-11");

    await expect(deletePayday(MEMBER, id)).rejects.toThrow(
      "A budget has a portion on 15th salary, so it can't be deleted."
    );
    expect(await names()).toEqual(["15th salary"]);
  });

  it("retires a payday only earlier months' budgets name, keeping its name", async () => {
    const { id } = await addPayday(MEMBER, "15th salary");
    const { setGroceries } = await groceriesBudget();
    await setGroceries("2026-10", id);
    await setGroceries("2026-11");

    await retirePayday(MEMBER, id, "2026-11");

    expect(await readPaydays()).toMatchObject([{ name: "15th salary", retired: true }]);
  });

  it.each([
    ["in force this month", "2026-10"],
    ["set from a later month", "2026-12"],
  ])("refuses to retire a payday a budget %s has a portion on", async (_case, fromMonth) => {
    const { id } = await addPayday(MEMBER, "15th salary");
    const { setGroceries } = await groceriesBudget();
    await setGroceries(fromMonth, id);

    await expect(retirePayday(MEMBER, id, "2026-11")).rejects.toThrow(
      "Groceries has a portion on 15th salary from this month on. Move it to another payday first."
    );
    expect(await readPaydays()).toMatchObject([{ retired: false }]);
  });

  it("retires a payday only a retired category's budget names this month", async () => {
    const { id } = await addPayday(MEMBER, "15th salary");
    const { groceriesId, setGroceries } = await groceriesBudget();
    await setGroceries("2026-11", id);
    await retireCategory(MEMBER, groceriesId);

    await retirePayday(MEMBER, id, "2026-11");

    expect(await readPaydays()).toMatchObject([{ retired: true }]);
  });

  it("unretires a payday", async () => {
    const { id } = await addPayday(MEMBER, "15th salary");
    await retirePayday(MEMBER, id, "2026-11");

    await unretirePayday(MEMBER, id);

    expect(await readPaydays()).toMatchObject([{ name: "15th salary", retired: false }]);
  });

  it("puts an unretired payday after the paydays in use", async () => {
    const fifteenth = await addPayday(MEMBER, "15th salary");
    await addPayday(MEMBER, "30th salary");
    await retirePayday(MEMBER, fifteenth.id, "2026-11");
    await addPayday(MEMBER, "Bonus");

    await unretirePayday(MEMBER, fifteenth.id);

    expect(await names()).toEqual(["30th salary", "Bonus", "15th salary"]);
  });

  it("refuses to unretire a payday in use", async () => {
    const { id } = await addPayday(MEMBER, "15th salary");

    await expect(unretirePayday(MEMBER, id)).rejects.toThrow("15th salary isn't retired.");
  });
});
