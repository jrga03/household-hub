import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testUsers } from "../../../../tests/e2e/fixtures/test-users";

const enabled = process.env.DEBT_SYNC_INTEGRATION === "1";
const apiUrl = process.env.LOCAL_API_URL ?? "http://127.0.0.1:54321";

vi.mock("@/lib/supabase", async () => {
  const { createClient: create } = await import("@supabase/supabase-js");
  const { env } = await import("node:process");
  const client = create(
    env.LOCAL_API_URL ?? "http://127.0.0.1:54321",
    env.LOCAL_ANON_KEY ?? "anon",
    { auth: { persistSession: false } }
  );
  return { supabase: client, untypedSupabase: client };
});

describe.skipIf(!enabled)("debt sync against the local stack", () => {
  const admin = createClient(apiUrl, process.env.LOCAL_SERVICE_ROLE_KEY ?? "service", {
    auth: { persistSession: false, storageKey: "integration-admin" },
  });
  let userId = "";
  const debtIds: string[] = [];
  const transactionIds: string[] = [];

  beforeAll(async () => {
    const { supabase } = await import("@/lib/supabase");
    const { data, error } = await supabase.auth.signInWithPassword(testUsers.primary);
    if (error || !data.user) throw error ?? new Error("sign-in failed");
    userId = data.user.id;
  });

  afterAll(async () => {
    if (!enabled || process.env.DEBT_SYNC_KEEP_ROWS === "1") return;
    await admin.from("debt_payments").delete().in("debt_id", debtIds);
    await admin.from("transactions").delete().in("id", transactionIds);
    await admin.from("debts").delete().in("id", debtIds);
  });

  it("creates, pays, reverses and matches the server balance", async () => {
    const { db } = await import("@/lib/dexie/db");
    const { DEFAULT_HOUSEHOLD_ID } = await import("@/lib/household");
    const { createExternalDebt } = await import("@/lib/debts/crud");
    const { calculateDebtBalance } = await import("@/lib/debts/balance");
    const { createOfflineTransaction, updateOfflineTransaction } =
      await import("@/lib/offline/transactions");
    const { syncProcessor } = await import("@/lib/sync/processor");
    const { supabase } = await import("@/lib/supabase");
    const { asCents } = await import("@/lib/currency");

    const debt = await createExternalDebt(
      {
        name: `Integration ${crypto.randomUUID()}`,
        original_amount_cents: asCents(10000),
        household_id: DEFAULT_HOUSEHOLD_ID,
      },
      userId
    );
    debtIds.push(debt.id);

    const created = await createOfflineTransaction(
      {
        date: "2026-10-06",
        description: "Debt sync integration",
        amount_cents: asCents(2500),
        type: "expense",
        status: "cleared",
        visibility: "household",
        debt_id: debt.id,
      },
      userId
    );
    if (!created.success || !created.data) throw new Error(created.error);
    const transactionId = created.data.id;
    transactionIds.push(transactionId);

    // Edit = reverse 2500, pay 4000
    const edited = await updateOfflineTransaction(
      transactionId,
      { amount_cents: asCents(4000) },
      userId
    );
    expect(edited.success).toBe(true);

    const drained = await syncProcessor.processQueue(userId);
    expect(drained.failed).toBe(0);
    expect(await db.syncQueue.where("status").anyOf("queued", "failed").count()).toBe(0);

    const { data: serverDebt } = await supabase
      .from("debts")
      .select("*")
      .eq("id", debt.id)
      .single();
    const { data: serverPayments } = await supabase
      .from("debt_payments")
      .select("amount_cents, is_reversal")
      .eq("debt_id", debt.id);
    expect(serverDebt?.original_amount_cents).toBe(10000);
    expect(serverPayments?.map((p) => p.amount_cents).sort((a, b) => a - b)).toEqual([
      -2500, 2500, 4000,
    ]);

    const serverBalance =
      (serverDebt?.original_amount_cents ?? 0) -
      (serverPayments ?? []).reduce((sum, p) => sum + p.amount_cents, 0);
    expect(serverBalance).toBe(await calculateDebtBalance(debt.id, "external"));
    expect(serverBalance).toBe(6000);
  });

  it("collapses a double reversal from two devices into one ledger", async () => {
    const { db } = await import("@/lib/dexie/db");
    const { DEFAULT_HOUSEHOLD_ID } = await import("@/lib/household");
    const { createExternalDebt } = await import("@/lib/debts/crud");
    const { calculateDebtBalance } = await import("@/lib/debts/balance");
    const { reconcileDebtLedger } = await import("@/lib/debts/reconcile");
    const { createOfflineTransaction, updateOfflineTransaction } =
      await import("@/lib/offline/transactions");
    const { syncProcessor } = await import("@/lib/sync/processor");
    const { RealtimeSync } = await import("@/lib/sync/realtime");
    const { supabase } = await import("@/lib/supabase");
    const { asCents } = await import("@/lib/currency");

    const debt = await createExternalDebt(
      {
        name: `Two devices ${crypto.randomUUID()}`,
        original_amount_cents: asCents(10000),
        household_id: DEFAULT_HOUSEHOLD_ID,
      },
      userId
    );
    debtIds.push(debt.id);
    const created = await createOfflineTransaction(
      {
        date: "2026-10-10",
        description: "Two-device integration",
        amount_cents: asCents(2500),
        type: "expense",
        status: "cleared",
        visibility: "household",
        debt_id: debt.id,
      },
      userId
    );
    if (!created.success || !created.data) throw new Error(created.error);
    const transactionId = created.data.id;
    transactionIds.push(transactionId);
    expect((await syncProcessor.processQueue(userId)).failed).toBe(0);
    const [original] = await db.debtPayments
      .where("transaction_id")
      .equals(transactionId)
      .toArray();
    if (!original) throw new Error("no local payment");

    // Device B edits the same transaction to 3000 and syncs first
    const remoteReversal = crypto.randomUUID();
    const remotePayment = crypto.randomUUID();
    const base = {
      household_id: DEFAULT_HOUSEHOLD_ID,
      debt_id: debt.id,
      transaction_id: transactionId,
      payment_date: "2026-10-10",
      device_id: "device-b",
    };
    const { error: insertError } = await admin.from("debt_payments").insert([
      {
        ...base,
        id: remoteReversal,
        amount_cents: -2500,
        is_reversal: true,
        reverses_payment_id: original.id,
      },
      { ...base, id: remotePayment, amount_cents: 3000 },
    ]);
    expect(insertError).toBeNull();
    await admin.from("transactions").update({ amount_cents: 3000 }).eq("id", transactionId);

    // This device, unaware, edits to 4000 and syncs: its reversal loses, its payment lands
    const edited = await updateOfflineTransaction(
      transactionId,
      { amount_cents: asCents(4000) },
      userId
    );
    expect(edited.success).toBe(true);
    expect((await syncProcessor.processQueue(userId)).failed).toBe(0);

    // Pull B's rows, reconcile, push the compensating reversal
    await new RealtimeSync().handleReconnection();
    await reconcileDebtLedger(
      { transactionIds: [transactionId], paymentIds: [remoteReversal, remotePayment] },
      userId
    );
    expect((await syncProcessor.processQueue(userId)).failed).toBe(0);

    const { data: serverPayments } = await supabase
      .from("debt_payments")
      .select("amount_cents, reverses_payment_id")
      .eq("debt_id", debt.id);
    const reversalsOfOriginal = (serverPayments ?? []).filter(
      (p) => p.reverses_payment_id === original.id
    );
    expect(reversalsOfOriginal).toHaveLength(1);
    const serverBalance =
      10000 - (serverPayments ?? []).reduce((sum, p) => sum + p.amount_cents, 0);
    expect(serverBalance).toBe(6000);
    expect(await calculateDebtBalance(debt.id, "external")).toBe(serverBalance);
  });
});
