import { beforeEach, describe, expect, it } from "vitest";
import { parsePHP } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { createAccount } from "@/lib/commands/accounts";
import { createCategory, createGroup } from "@/lib/commands/categories";
import { addTransaction, removeTransaction, restoreTransaction } from "@/lib/commands/transactions";
import { addTransfer, removeTransfer } from "@/lib/commands/transfers";
import { recordBalanceCorrection } from "@/lib/commands/corrections";
import { readTransactionsCsv } from "./transactions-csv";

const MEMBER = { householdId: "11111111-1111-4111-8111-111111111111", userId: "user-a" };

const account = async (name: string) =>
  (await createAccount(MEMBER, { name, type: "bank", startingBalanceCents: parsePHP("0") })).id;

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("transactions CSV", () => {
  it("lists transactions and transfers oldest first, leaving removed ones out", async () => {
    const bankId = await account("BDO");
    const walletId = await account("Wallet");
    const { id: groupId } = await createGroup(MEMBER, { name: "Needs" });
    const { id: groceriesId } = await createCategory(MEMBER, { name: "Groceries", groupId });

    await addTransfer(MEMBER, {
      date: "2026-10-03",
      amountCents: parsePHP("2000"),
      fromAccountId: bankId,
      toAccountId: walletId,
      envelope: { kind: "category", id: groceriesId },
      description: "Cash for the market",
    });
    await addTransaction(MEMBER, {
      date: "2026-10-01",
      type: "expense",
      amountCents: parsePHP("1500.5"),
      accountId: walletId,
      categoryId: groceriesId,
      description: "Rice, 5kg",
      notes: "From the corner store",
      status: "pending",
    });
    await addTransaction(MEMBER, {
      date: "2026-10-02",
      type: "income",
      amountCents: parsePHP("30000"),
      accountId: bankId,
      categoryId: null,
      description: "Salary",
    });
    const removed = await addTransaction(MEMBER, {
      date: "2026-10-02",
      type: "expense",
      amountCents: parsePHP("99"),
      accountId: bankId,
      categoryId: null,
      description: "Typo",
    });
    await removeTransaction(MEMBER, removed.id);
    const removedTransfer = await addTransfer(MEMBER, {
      date: "2026-10-04",
      amountCents: parsePHP("5"),
      fromAccountId: bankId,
      toAccountId: walletId,
      envelope: { kind: "unassigned" },
    });
    await removeTransfer(MEMBER, removedTransfer.id);

    expect(await readTransactionsCsv()).toBe(
      [
        "Date,Type,Amount,Account,To account,Category,Status,Description,Notes",
        '2026-10-01,Expense,1500.50,Wallet,,Groceries,Pending,"Rice, 5kg",From the corner store',
        "2026-10-02,Income,30000.00,BDO,,Unassigned,Cleared,Salary,",
        "2026-10-03,Transfer,2000.00,BDO,Wallet,Groceries,Cleared,Cash for the market,",
        "",
      ].join("\r\n")
    );
  });

  it("lists balance corrections with a signed amount and their envelope", async () => {
    const bankId = await account("BDO");
    const { id: groupId } = await createGroup(MEMBER, { name: "Needs" });
    const { id: groceriesId } = await createCategory(MEMBER, { name: "Groceries", groupId });
    await recordBalanceCorrection(MEMBER, {
      accountId: bankId,
      date: "2026-10-05",
      actualBalanceCents: parsePHP("120"),
      envelope: { kind: "unassigned" },
    });
    await recordBalanceCorrection(MEMBER, {
      accountId: bankId,
      date: "2026-10-06",
      actualBalanceCents: parsePHP("100"),
      envelope: { kind: "category", id: groceriesId },
    });

    expect(await readTransactionsCsv()).toBe(
      [
        "Date,Type,Amount,Account,To account,Category,Status,Description,Notes",
        "2026-10-05,Balance correction,120.00,BDO,,Unassigned,Cleared,,",
        "2026-10-06,Balance correction,-20.00,BDO,,Groceries,Cleared,,",
        "",
      ].join("\r\n")
    );
  });

  it("brings back a transaction that was removed and then restored", async () => {
    const bankId = await account("BDO");
    const { id } = await addTransaction(MEMBER, {
      date: "2026-10-05",
      type: "expense",
      amountCents: parsePHP("80"),
      accountId: bankId,
      categoryId: null,
      description: "Jeepney",
    });
    await removeTransaction(MEMBER, id);
    await restoreTransaction(MEMBER, id);

    expect(await readTransactionsCsv()).toContain(
      "\r\n2026-10-05,Expense,80.00,BDO,,Unassigned,Cleared,Jeepney,\r\n"
    );
  });

  it("has only the header when there is nothing to export", async () => {
    expect(await readTransactionsCsv()).toBe(
      "Date,Type,Amount,Account,To account,Category,Status,Description,Notes\r\n"
    );
  });
});
