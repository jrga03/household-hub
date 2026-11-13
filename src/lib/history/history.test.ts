import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/dexie/db";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { parsePHP } from "@/lib/currency";
import { createAccount } from "@/lib/commands/accounts";
import { createCategory, createGroup } from "@/lib/commands/categories";
import { addTransfer } from "@/lib/commands/transfers";
import { HOUSEHOLD } from "@/test/events";
import { readCategoryHistory } from "./history";

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("category history", () => {
  it("counts a transfer in the category it left and the one it arrived in", async () => {
    const groupId = (await createGroup(MEMBER, { name: "Food" })).id;
    const categoryNamed = async (name: string) =>
      (await createCategory(MEMBER, { name, groupId })).id;
    const accountNamed = async (name: string) =>
      (await createAccount(MEMBER, { name, type: "bank", startingBalanceCents: parsePHP("0") })).id;
    const groceriesId = await categoryNamed("Groceries");
    const diningId = await categoryNamed("Dining");
    await addTransfer(MEMBER, {
      date: "2026-10-05",
      amountCents: parsePHP("500"),
      fromAccountId: await accountNamed("BPI"),
      toAccountId: await accountNamed("GCash"),
      fromEnvelope: { kind: "category", id: groceriesId },
      toEnvelope: { kind: "category", id: diningId },
    });

    const historyOf = async (id: string) => {
      const category = await db.categories.get(id);
      return category ? readCategoryHistory(category) : [];
    };
    expect(await historyOf(groceriesId)).toEqual(["1 transfer"]);
    expect(await historyOf(diningId)).toEqual(["1 transfer"]);
  });
});
