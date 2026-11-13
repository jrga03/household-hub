import { beforeEach, describe, expect, it } from "vitest";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { readPaydays } from "@/lib/paydays/projection";
import { HOUSEHOLD } from "@/test/events";
import { addPayday, deletePayday, movePayday, renamePayday } from "./paydays";

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

const names = async () => (await readPaydays()).map((payday) => payday.name);

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
});
