import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/dexie/db";
import { DEFAULT_HOUSEHOLD_ID } from "@/lib/household";
import { cents } from "@/test/cents";
import { createOfflineTransaction } from "@/lib/offline/transactions";
import { reportError } from "@/lib/sentry";
import { createExternalDebt } from "../crud";
import { calculateDebtBalance } from "../balance";
import { reconcileDebtLedger } from "../reconcile";
import { createTestPayment } from "./test-utils";

vi.mock("@/lib/supabase", () => {
  const supabase = {
    from: vi.fn(),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
  };
  return { supabase, untypedSupabase: supabase };
});
vi.mock("@/lib/sentry", () => ({ reportError: vi.fn() }));

const USER = "12345678-1234-5678-1234-567812345678";

async function debt(amount = 100000) {
  return createExternalDebt(
    {
      name: `Loan ${crypto.randomUUID()}`,
      original_amount_cents: cents(amount),
      household_id: DEFAULT_HOUSEHOLD_ID,
    },
    USER
  );
}

/** A synced debt-linked transaction: its payment P1 exists and the outbox is empty. */
async function linkedTransaction(debtId: string, amount: number) {
  const result = await createOfflineTransaction(
    {
      date: "2026-10-10",
      description: "Payment",
      amount_cents: cents(amount),
      type: "expense",
      status: "cleared",
      visibility: "household",
      debt_id: debtId,
    },
    USER
  );
  if (!result.success || !result.data) throw new Error(result.error);
  await db.syncQueue.clear();
  await touchTransaction(result.data.id);
  return result.data;
}

/** Stamps the transaction newer than its payments, as a completed edit leaves it. */
async function touchTransaction(transactionId: string) {
  await db.transactions.update(transactionId, {
    updated_at: new Date(Date.now() + 1000).toISOString(),
  });
}

/** A payment row as another device's edit leaves it after a pull. */
async function remotePayment(debtId: string, transactionId: string | null, amount: number) {
  const row = createTestPayment({
    household_id: DEFAULT_HOUSEHOLD_ID,
    debt_id: debtId,
    transaction_id: transactionId,
    amount_cents: cents(amount),
  });
  await db.debtPayments.add(row);
  if (transactionId) await touchTransaction(transactionId);
  return row;
}

async function livePaymentIds(transactionId: string) {
  const rows = await db.debtPayments.where("transaction_id").equals(transactionId).toArray();
  const reversed = new Set(
    rows.flatMap((p) => (p.reverses_payment_id ? [p.reverses_payment_id] : []))
  );
  return rows.filter((p) => !p.is_reversal && !reversed.has(p.id)).map((p) => p.id);
}

describe("reconcileDebtLedger", () => {
  beforeEach(async () => {
    vi.mocked(reportError).mockClear();
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  it("keeps the payment matching the transaction and reverses the other device's", async () => {
    const { id: debtId } = await debt();
    const transaction = await linkedTransaction(debtId, 4000);
    const [mine] = await livePaymentIds(transaction.id);
    const theirs = await remotePayment(debtId, transaction.id, 3000);

    const result = await reconcileDebtLedger(
      { transactionIds: [transaction.id], paymentIds: [theirs.id] },
      USER
    );

    expect(result.reversedPaymentIds).toEqual([theirs.id]);
    expect(await livePaymentIds(transaction.id)).toEqual([mine]);
    expect(await calculateDebtBalance(debtId, "external")).toBe(96000);
    expect(await db.syncQueue.where("entity_type").equals("debt_payment").count()).toBe(1);
  });

  it("keeps the smallest id when both payments match", async () => {
    const { id: debtId } = await debt();
    const transaction = await linkedTransaction(debtId, 4000);
    await remotePayment(debtId, transaction.id, 4000);
    const [keeper] = (await livePaymentIds(transaction.id)).sort();

    await reconcileDebtLedger({ transactionIds: [transaction.id], paymentIds: [] }, USER);

    expect(await livePaymentIds(transaction.id)).toEqual([keeper]);
  });

  it("picks the keeper by code-unit order whatever the device locale", async () => {
    const { id: debtId } = await debt();
    const transaction = await linkedTransaction(debtId, 4000);
    await db.debtPayments.where("transaction_id").equals(transaction.id).delete();
    const keeperId = "aa000000-0000-4000-8000-000000000000";
    const otherId = "ab000000-0000-4000-8000-000000000000";
    for (const id of [keeperId, otherId]) {
      await db.debtPayments.add({
        ...createTestPayment({
          household_id: DEFAULT_HOUSEHOLD_ID,
          debt_id: debtId,
          transaction_id: transaction.id,
          amount_cents: cents(4000),
        }),
        id,
      });
    }
    const danish = new Intl.Collator("da-DK");
    vi.spyOn(String.prototype, "localeCompare").mockImplementation(function (this: string, other) {
      return danish.compare(this, other);
    });

    try {
      await reconcileDebtLedger({ transactionIds: [transaction.id], paymentIds: [] }, USER);
    } finally {
      vi.restoreAllMocks();
    }

    expect(await livePaymentIds(transaction.id)).toEqual([keeperId]);
  });

  it("reverses every live payment of a transaction that is no longer linked", async () => {
    const { id: debtId } = await debt();
    const transaction = await linkedTransaction(debtId, 4000);
    await db.transactions.update(transaction.id, { debt_id: undefined });

    await reconcileDebtLedger({ transactionIds: [transaction.id], paymentIds: [] }, USER);

    expect(await livePaymentIds(transaction.id)).toEqual([]);
    expect(await calculateDebtBalance(debtId, "external")).toBe(100000);
  });

  it("reverses a pulled payment whose transaction was deleted", async () => {
    const { id: debtId } = await debt();
    const orphan = await remotePayment(debtId, null, 2500);

    const result = await reconcileDebtLedger({ transactionIds: [], paymentIds: [orphan.id] }, USER);

    expect(result.reversedPaymentIds).toEqual([orphan.id]);
    expect(await calculateDebtBalance(debtId, "external")).toBe(100000);
  });

  it("skips a transaction with outbox items still pending", async () => {
    const { id: debtId } = await debt();
    const transaction = await linkedTransaction(debtId, 4000);
    await remotePayment(debtId, transaction.id, 3000);
    await db.syncQueue.add({
      id: crypto.randomUUID(),
      household_id: DEFAULT_HOUSEHOLD_ID,
      entity_type: "transaction",
      entity_id: transaction.id,
      operation: {
        op: "update",
        payload: {},
        idempotencyKey: "k",
        lamportClock: 1,
        vectorClock: {},
      },
      device_id: "d",
      user_id: USER,
      status: "queued",
      retry_count: 0,
      max_retries: 3,
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      synced_at: null,
      next_retry_at: null,
    });

    const result = await reconcileDebtLedger(
      { transactionIds: [transaction.id], paymentIds: [] },
      USER
    );

    expect(result.reversedPaymentIds).toEqual([]);
    expect(await livePaymentIds(transaction.id)).toHaveLength(2);
  });

  it("reports and writes nothing when no live payment matches", async () => {
    const { id: debtId } = await debt();
    const transaction = await linkedTransaction(debtId, 4000);
    await db.transactions.update(transaction.id, { amount_cents: cents(5000) });

    const result = await reconcileDebtLedger(
      { transactionIds: [transaction.id], paymentIds: [] },
      USER
    );

    expect(result.reversedPaymentIds).toEqual([]);
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ operation: "reconcile" })
    );
    expect(await db.syncQueue.count()).toBe(0);
  });

  it("skips a transaction older than a live payment, whose update is still retrying", async () => {
    const { id: debtId } = await debt();
    const transaction = await linkedTransaction(debtId, 4000);
    const theirs = await remotePayment(debtId, transaction.id, 3000);
    await db.transactions.update(transaction.id, {
      updated_at: new Date(new Date(theirs.created_at).getTime() - 60_000).toISOString(),
    });

    const result = await reconcileDebtLedger(
      { transactionIds: [transaction.id], paymentIds: [theirs.id] },
      USER
    );

    expect(result.reversedPaymentIds).toEqual([]);
    expect(await livePaymentIds(transaction.id)).toHaveLength(2);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("writes each reversal once across repeated runs", async () => {
    const { id: debtId } = await debt();
    const transaction = await linkedTransaction(debtId, 4000);
    await remotePayment(debtId, transaction.id, 3000);
    const changes = { transactionIds: [transaction.id], paymentIds: [] };

    await reconcileDebtLedger(changes, USER);
    await db.syncQueue.clear();
    const second = await reconcileDebtLedger(changes, USER);

    expect(second.reversedPaymentIds).toEqual([]);
    expect((await db.debtPayments.toArray()).filter((p) => p.is_reversal)).toHaveLength(1);
  });

  it("re-derives the status of a debt a pulled payment paid off", async () => {
    const { id: debtId } = await debt(2500);
    const transaction = await linkedTransaction(debtId, 1000);
    // Another device's payment for a transaction this device has not pulled
    const pulled = await remotePayment(debtId, "remote-transaction", 1500);

    await reconcileDebtLedger({ transactionIds: [transaction.id], paymentIds: [pulled.id] }, USER);

    expect((await db.debts.get(debtId))?.status).toBe("paid_off");
  });
});
