/**
 * Cross-cutting outbox guard: every exported data-layer function is
 * classified, and every mutation (a) enqueues sync items for what it writes
 * and (b) writes nothing when the outbox write fails, which proves the row
 * and its queue item share one Dexie transaction.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/dexie/db";
import { DEFAULT_HOUSEHOLD_ID } from "@/lib/household";
import { cents } from "@/test/cents";
import type { EntityType } from "@/types/sync";
import * as accounts from "./accounts";
import * as budgets from "./budgets";
import * as categories from "./categories";
import * as importDrafts from "./importDrafts";
import * as transactions from "./transactions";
import * as transfers from "./transfers";
import type { OfflineOperationResult, TransactionInput } from "./types";
import * as debtCrud from "@/lib/debts/crud";
import * as debtPayments from "@/lib/debts/payments";
import * as debtReversals from "@/lib/debts/reversals";
import * as debtStatus from "@/lib/debts/status";
import { createTestPayment } from "@/lib/debts/__tests__/test-utils";

vi.mock("@/lib/supabase", () => {
  const supabase = {
    from: vi.fn(),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
  };
  return { supabase, untypedSupabase: supabase };
});

const USER = "12345678-1234-5678-1234-567812345678";
const MONTH = new Date(2026, 9, 1);

const modules = {
  ...import.meta.glob(["./*.ts", "!./*.test.ts"], { eager: true }),
  ...import.meta.glob(["../debts/*.ts", "!../debts/*.test.ts"], { eager: true }),
} as Record<string, Record<string, unknown>>;

function exportedFunctionNames(): string[] {
  const names = new Set<string>();
  for (const moduleExports of Object.values(modules)) {
    for (const [name, value] of Object.entries(moduleExports)) {
      if (typeof value === "function") names.add(name);
    }
  }
  return [...names].sort();
}

const READS = [
  "budgetMonthKey",
  "hasMirroredBudgets",
  "getLocalBudgetGroups",
  "hasLocalFinancialData",
  "getLocalDashboardData",
  "duplicateAccountNameError",
  "duplicateCategoryNameError",
  "isOfflineError",
  "isLikelyNetworkError",
  "applyTransactionFilters",
  "getLocalTransactionsWithRelations",
  "getUnsyncedLocalTransactionsWithRelations",
  "getPendingTransactionDeleteIds",
  "overlayLocalTransactions",
  "mergeTransactionPages",
  "getLocalTransactionsFilterSummary",
  "getLocalActiveAccounts",
  "getLocalActiveCategories",
  "getPendingQueueItems",
  "getOutstandingQueueItems",
  "getQueueCount",
  "getFailedCount",
  "groupTransferLegs",
  "getLocalTransfers",
  "getPendingDrafts",
  "getPendingDraftCount",
  "resolveCategoryName",
  "calculateDebtBalance",
  "calculateDebtBalanceWithDetails",
  "calculateMultipleBalances",
  "sumPayments",
  "getReversedPaymentIds",
  "getDebt",
  "getDebtWithBalance",
  "listDebts",
  "searchDebtsByName",
  "getDebtsWithBalances",
  "calculateDelta",
  "eventExists",
  "getDebtEvents",
  "getPaymentEvents",
  "getDebtEventsInRange",
  "toDebtInsert",
  "toInternalDebtInsert",
  "toDebtPaymentInsert",
  "getDebtPayments",
  "getPayment",
  "getPaymentsByTransaction",
  "isTransactionLinkedToDebt",
  "isPaymentReversed",
  "getPaymentReversals",
  "nextDebtStatus",
  "getExpectedStatus",
  "isValidStatusTransition",
  "getSyncStatusForDebt",
  "getPendingDebtSyncCount",
  "validateAmount",
  "validateDebtName",
  "validateEntityExists",
  "getEntityDisplayName",
  "validateDebtCreation",
  "validateInternalDebtCreation",
  "validateDebtDeletion",
  "isDebtNameUnique",
  "parseAmountInput",
  "formatAmountInput",
];

const QUEUE_MAINTENANCE = "sync queue maintenance; these items are the outbox itself";
const BUILDING_BLOCK = "outbox building block; covered through the mutations that use it";
const DRAFTS = "local-only import draft tables; drafts never sync";

const EXEMPT: Record<string, string> = {
  afterOutboxWrite: "starts a sync drain after a write; writes nothing itself",
  mirrorBudgetsForMonth: "caches server budgets locally; nothing to sync",
  ensureLocalRow: "hydrates a server row into Dexie; nothing to sync",
  buildSyncQueueItem: QUEUE_MAINTENANCE,
  addToSyncQueue: QUEUE_MAINTENANCE,
  resetStaleSyncingItems: QUEUE_MAINTENANCE,
  requeueOwnerColumnFailures: QUEUE_MAINTENANCE,
  cleanupCompletedItems: QUEUE_MAINTENANCE,
  retrySyncQueueItem: QUEUE_MAINTENANCE,
  retryAllFailedItems: QUEUE_MAINTENANCE,
  discardSyncQueueItem: QUEUE_MAINTENANCE,
  clearCompletedItems: QUEUE_MAINTENANCE,
  createImportSession: DRAFTS,
  updateDraft: DRAFTS,
  discardDraft: DRAFTS,
  restoreDrafts: DRAFTS,
  restoreDraft: DRAFTS,
  emptyWriteSet: BUILDING_BLOCK,
  mergeWriteSets: BUILDING_BLOCK,
  prepareDebtCreate: BUILDING_BLOCK,
  prepareDebtUpdate: BUILDING_BLOCK,
  prepareDebtDelete: BUILDING_BLOCK,
  preparePaymentAdd: BUILDING_BLOCK,
  debtWriteTables: BUILDING_BLOCK,
  applyDebtWriteSet: BUILDING_BLOCK,
  commitDebtWriteSet: BUILDING_BLOCK,
  prepareDebtPayment: BUILDING_BLOCK,
  prepareReversal: BUILDING_BLOCK,
  prepareTransactionEdit: BUILDING_BLOCK,
  prepareTransactionDelete: BUILDING_BLOCK,
  DebtLedgerView: "working copy for prepares; writes nothing",
  repairLegacyDebtIds: "one-shot legacy repair; covered by debts/__tests__/repair.test.ts",
  OfflineError: "error class",
};

interface Scenario {
  /** entity_type values the mutation may enqueue */
  entityTypes: readonly EntityType[];
  /** Sets up fixtures, returns the call under test */
  prepare: () => Promise<() => Promise<unknown>>;
}

function must<T>(result: OfflineOperationResult<T>): T {
  if (!result.success || result.data === undefined) {
    throw new Error(result.error ?? "fixture setup failed");
  }
  return result.data;
}

async function account(name = `Wallet ${crypto.randomUUID()}`) {
  return must(
    await accounts.createOfflineAccount(
      { name, type: "cash", visibility: "household", initial_balance_cents: cents(0) },
      USER
    )
  );
}

async function category(name = `Food ${crypto.randomUUID()}`) {
  return must(await categories.createOfflineCategory({ name }, USER));
}

function transactionInput(overrides: Partial<TransactionInput> = {}): TransactionInput {
  return {
    date: "2026-10-07",
    description: "Lunch",
    amount_cents: cents(2500),
    type: "expense",
    status: "cleared",
    visibility: "household",
    ...overrides,
  };
}

async function transaction(overrides: Partial<TransactionInput> = {}) {
  return must(await transactions.createOfflineTransaction(transactionInput(overrides), USER));
}

async function debt(amount = 10000) {
  return debtCrud.createExternalDebt(
    {
      name: `Loan ${crypto.randomUUID()}`,
      original_amount_cents: cents(amount),
      household_id: DEFAULT_HOUSEHOLD_ID,
    },
    USER
  );
}

async function budget() {
  const { id } = await category();
  return must(
    await budgets.createOfflineBudget(
      { categoryId: id, month: MONTH, amountCents: cents(50000) },
      USER
    )
  );
}

/** A debt whose stored status lags its balance (paid in full, still active). */
async function debtNeedingStatusFlip() {
  const lagging = await debt(2500);
  await db.debtPayments.add(
    createTestPayment({
      debt_id: lagging.id,
      amount_cents: cents(2500),
      household_id: DEFAULT_HOUSEHOLD_ID,
    })
  );
  return lagging;
}

const MUTATIONS: Record<string, Scenario> = {
  createOfflineAccount: {
    entityTypes: ["account"],
    prepare: async () => () =>
      accounts.createOfflineAccount(
        { name: "Cash", type: "cash", visibility: "household", initial_balance_cents: cents(0) },
        USER
      ),
  },
  updateOfflineAccount: {
    entityTypes: ["account"],
    prepare: async () => {
      const { id } = await account();
      return () =>
        accounts.updateOfflineAccount(id, { name: `Renamed ${crypto.randomUUID()}` }, USER);
    },
  },
  deactivateOfflineAccount: {
    entityTypes: ["account"],
    prepare: async () => {
      const { id } = await account();
      return () => accounts.deactivateOfflineAccount(id, USER);
    },
  },
  createOfflineCategory: {
    entityTypes: ["category"],
    prepare: async () => () => categories.createOfflineCategory({ name: "Groceries" }, USER),
  },
  updateOfflineCategory: {
    entityTypes: ["category"],
    prepare: async () => {
      const { id } = await category();
      return () =>
        categories.updateOfflineCategory(id, { name: `Renamed ${crypto.randomUUID()}` }, USER);
    },
  },
  deactivateOfflineCategory: {
    entityTypes: ["category"],
    prepare: async () => {
      const { id } = await category();
      return () => categories.deactivateOfflineCategory(id, USER);
    },
  },
  createOfflineBudget: {
    entityTypes: ["budget"],
    prepare: async () => {
      const { id } = await category();
      return () =>
        budgets.createOfflineBudget(
          { categoryId: id, month: MONTH, amountCents: cents(50000) },
          USER
        );
    },
  },
  updateOfflineBudget: {
    entityTypes: ["budget"],
    prepare: async () => {
      const { id } = await budget();
      return () => budgets.updateOfflineBudget(id, cents(60000), USER);
    },
  },
  deleteOfflineBudget: {
    entityTypes: ["budget"],
    prepare: async () => {
      const { id } = await budget();
      return () => budgets.deleteOfflineBudget(id, USER);
    },
  },
  copyOfflineBudgets: {
    entityTypes: ["budget"],
    prepare: async () => {
      const source = await budget();
      await budgets.mirrorBudgetsForMonth(budgets.budgetMonthKey(MONTH), [source]);
      return () => budgets.copyOfflineBudgets(MONTH, new Date(2026, 10, 1), USER);
    },
  },
  createOfflineTransaction: {
    entityTypes: ["transaction"],
    prepare: async () => () => transactions.createOfflineTransaction(transactionInput(), USER),
  },
  updateOfflineTransaction: {
    entityTypes: ["transaction"],
    prepare: async () => {
      const { id } = await transaction();
      return () => transactions.updateOfflineTransaction(id, { description: "Dinner" }, USER);
    },
  },
  updateOfflineTransactionsStatus: {
    entityTypes: ["transaction"],
    prepare: async () => {
      const { id } = await transaction();
      return () => transactions.updateOfflineTransactionsStatus([id], "pending", USER);
    },
  },
  deleteOfflineTransaction: {
    entityTypes: ["transaction"],
    prepare: async () => {
      const { id } = await transaction();
      return () => transactions.deleteOfflineTransaction(id, USER);
    },
  },
  createOfflineTransactionsBatch: {
    entityTypes: ["transaction"],
    prepare: async () => () =>
      transactions.createOfflineTransactionsBatch(
        [transactionInput(), transactionInput({ description: "Snack" })],
        USER
      ),
  },
  createOfflineTransfer: {
    entityTypes: ["transaction"],
    prepare: async () => {
      const from = await account();
      const to = await account();
      return () =>
        transfers.createOfflineTransfer(
          {
            from_account_id: from.id,
            to_account_id: to.id,
            from_account_name: from.name,
            to_account_name: to.name,
            amount_cents: cents(1000),
            date: "2026-10-07",
          },
          USER
        );
    },
  },
  confirmDrafts: {
    entityTypes: ["transaction"],
    prepare: async () => {
      const { id } = await account();
      const { drafts } = await importDrafts.createImportSession(
        "statement.pdf",
        "bdo",
        [
          {
            date: "2026-10-01",
            description: "Coffee",
            amount: "150.00",
            type: "expense",
            confidence: 1,
            rawText: "Coffee 150.00",
          },
        ],
        id
      );
      return () =>
        importDrafts.confirmDrafts(
          drafts.map((draft) => draft.id),
          USER
        );
    },
  },
  createExternalDebt: {
    entityTypes: ["debt"],
    prepare: async () => () => debt(),
  },
  createInternalDebt: {
    entityTypes: ["internal_debt"],
    prepare: async () => {
      const from = await account();
      const to = await account();
      return () =>
        debtCrud.createInternalDebt(
          {
            name: `IOU ${crypto.randomUUID()}`,
            original_amount_cents: cents(5000),
            household_id: DEFAULT_HOUSEHOLD_ID,
            from_type: "account",
            from_id: from.id,
            to_type: "account",
            to_id: to.id,
          },
          USER
        );
    },
  },
  updateDebtName: {
    entityTypes: ["debt"],
    prepare: async () => {
      const { id } = await debt();
      return () => debtCrud.updateDebtName(id, "external", `Renamed ${crypto.randomUUID()}`, USER);
    },
  },
  archiveDebt: {
    entityTypes: ["debt"],
    prepare: async () => {
      const { id } = await debt();
      return () => debtCrud.archiveDebt(id, "external", USER);
    },
  },
  unarchiveDebt: {
    entityTypes: ["debt"],
    prepare: async () => {
      const { id } = await debt();
      await debtCrud.archiveDebt(id, "external", USER);
      return () => debtCrud.unarchiveDebt(id, "external", USER);
    },
  },
  deleteDebt: {
    entityTypes: ["debt"],
    prepare: async () => {
      const { id } = await debt();
      return () => debtCrud.deleteDebt(id, "external", USER);
    },
  },
  processDebtPayment: {
    entityTypes: ["debt_payment", "debt"],
    prepare: async () => {
      const { id } = await debt();
      return () =>
        debtPayments.processDebtPayment(
          {
            transaction_id: crypto.randomUUID(),
            amount_cents: cents(2500),
            payment_date: "2026-10-07",
            debt_id: id,
            household_id: DEFAULT_HOUSEHOLD_ID,
          },
          USER
        );
    },
  },
  reverseDebtPayment: {
    entityTypes: ["debt_payment", "debt"],
    prepare: async () => {
      const { id } = await debt();
      const { payment } = await debtPayments.processDebtPayment(
        {
          transaction_id: crypto.randomUUID(),
          amount_cents: cents(2500),
          payment_date: "2026-10-07",
          debt_id: id,
          household_id: DEFAULT_HOUSEHOLD_ID,
        },
        USER
      );
      return () =>
        debtReversals.reverseDebtPayment({ payment_id: payment.id, reason: "test" }, USER);
    },
  },
  handleTransactionEdit: {
    entityTypes: ["debt_payment", "debt"],
    prepare: async () => {
      const { id: debtId } = await debt();
      const { id } = await transaction({ debt_id: debtId });
      return () =>
        debtReversals.handleTransactionEdit(
          {
            transaction_id: id,
            new_amount_cents: cents(4000),
            new_debt_id: debtId,
            payment_date: "2026-10-07",
          },
          USER
        );
    },
  },
  handleTransactionDelete: {
    entityTypes: ["debt_payment", "debt"],
    prepare: async () => {
      const { id: debtId } = await debt();
      const { id } = await transaction({ debt_id: debtId });
      return () => debtReversals.handleTransactionDelete({ transaction_id: id }, USER);
    },
  },
  updateDebtStatusFromBalance: {
    entityTypes: ["debt"],
    prepare: async () => {
      const { id } = await debtNeedingStatusFlip();
      return () => debtStatus.updateDebtStatusFromBalance(id, "external", USER);
    },
  },
  updateMultipleDebtStatuses: {
    entityTypes: ["debt"],
    prepare: async () => {
      const { id } = await debtNeedingStatusFlip();
      return () => debtStatus.updateMultipleDebtStatuses([id], "external", USER);
    },
  },
  recoverInvalidDebtStates: {
    entityTypes: ["debt"],
    prepare: async () => {
      await debtNeedingStatusFlip();
      return () => debtStatus.recoverInvalidDebtStates("external", USER);
    },
  },
};

const DEBT_LINKED = ["transaction", "debt_payment", "debt"] as const;

async function debtLinkedTransaction() {
  const { id: debtId } = await debt();
  return transaction({ debt_id: debtId });
}

/** Extra scenarios keyed "<exportName> (<variant>)"; the export must be in MUTATIONS */
const VARIANTS: Record<string, Scenario> = {
  "createOfflineTransaction (debt-linked)": {
    entityTypes: DEBT_LINKED,
    prepare: async () => {
      const { id: debtId } = await debt();
      return () =>
        transactions.createOfflineTransaction(transactionInput({ debt_id: debtId }), USER);
    },
  },
  "updateOfflineTransaction (debt-linked amount change)": {
    entityTypes: DEBT_LINKED,
    prepare: async () => {
      const { id } = await debtLinkedTransaction();
      return () => transactions.updateOfflineTransaction(id, { amount_cents: cents(4000) }, USER);
    },
  },
  "updateOfflineTransaction (debt unlinked)": {
    entityTypes: DEBT_LINKED,
    prepare: async () => {
      const { id } = await debtLinkedTransaction();
      return () => transactions.updateOfflineTransaction(id, { debt_id: null }, USER);
    },
  },
  "deleteOfflineTransaction (debt-linked)": {
    entityTypes: DEBT_LINKED,
    prepare: async () => {
      const { id } = await debtLinkedTransaction();
      return () => transactions.deleteOfflineTransaction(id, USER);
    },
  },
};

function variantExportName(key: string): string {
  return key.replace(/ \(.*\)$/, "");
}

const SYNCED_TABLES: Record<string, EntityType> = {
  transactions: "transaction",
  accounts: "account",
  categories: "category",
  budgets: "budget",
  debts: "debt",
  internalDebts: "internal_debt",
  debtPayments: "debt_payment",
};

const ENTITY_TABLES = [...Object.keys(SYNCED_TABLES), "events"];

async function snapshotSyncedTables() {
  const snapshot = new Map<string, { entityType: EntityType; json: string }>();
  for (const [name, entityType] of Object.entries(SYNCED_TABLES)) {
    const rows = (await db.table(name).toArray()) as { id: string }[];
    for (const row of rows) snapshot.set(row.id, { entityType, json: JSON.stringify(row) });
  }
  return snapshot;
}

function changedRows(
  before: Awaited<ReturnType<typeof snapshotSyncedTables>>,
  after: Awaited<ReturnType<typeof snapshotSyncedTables>>
) {
  const changed: { id: string; entityType: EntityType }[] = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const previous = before.get(id);
    const next = after.get(id);
    const row = next ?? previous;
    if (row && previous?.json !== next?.json) changed.push({ id, entityType: row.entityType });
  }
  return changed;
}

async function dumpEntityTables() {
  const dump: Record<string, unknown[]> = {};
  for (const name of ENTITY_TABLES) {
    const rows = (await db.table(name).toArray()) as { id: string }[];
    dump[name] = rows.sort((a, b) => a.id.localeCompare(b.id));
  }
  return dump;
}

function rejectOutboxWrites() {
  return (["add", "bulkAdd", "put", "bulkPut"] as const).map((method) =>
    vi.spyOn(db.syncQueue, method).mockRejectedValue(new Error("outbox write rejected"))
  );
}

function silenceConsole() {
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
}

async function callFails(call: () => Promise<unknown>): Promise<boolean> {
  try {
    const result = await call();
    return (
      typeof result === "object" &&
      result !== null &&
      "success" in result &&
      result.success === false
    );
  } catch {
    return true;
  }
}

describe("outbox invariant", () => {
  beforeEach(async () => {
    silenceConsole();
    await Promise.all(db.tables.map((table) => table.clear()));
  });
  afterEach(() => vi.restoreAllMocks());

  it("classifies every exported data-layer function", () => {
    const classified = new Set([...READS, ...Object.keys(EXEMPT), ...Object.keys(MUTATIONS)]);
    const unclassified = exportedFunctionNames().filter((name) => !classified.has(name));
    expect(unclassified, "classify these as READS, EXEMPT (with a reason) or MUTATIONS").toEqual(
      []
    );

    const exported = new Set(exportedFunctionNames());
    const stale = [...classified].filter((name) => !exported.has(name));
    expect(stale, "these classified names are no longer exported").toEqual([]);

    const lists = [READS, Object.keys(EXEMPT), Object.keys(MUTATIONS)];
    const duplicates = [...classified].filter(
      (name) => lists.filter((list) => list.includes(name)).length > 1
    );
    expect(duplicates, "classify each name once").toEqual([]);
  });

  it("names an exported mutation in every variant", () => {
    const unknown = Object.keys(VARIANTS).filter((key) => !(variantExportName(key) in MUTATIONS));
    expect(unknown, 'variant keys must be "<MUTATIONS key> (<variant>)"').toEqual([]);
  });

  describe.each(Object.entries({ ...MUTATIONS, ...VARIANTS }))("%s", (_name, scenario) => {
    it("enqueues a sync item for every row it writes", async () => {
      const call = await scenario.prepare();
      await db.syncQueue.clear();
      const before = await snapshotSyncedTables();
      await call();
      const changed = changedRows(before, await snapshotSyncedTables());
      const items = await db.syncQueue.toArray();

      expect(changed.length, "the call wrote no synced row").toBeGreaterThan(0);
      const queued = new Set(items.map((item) => `${item.entity_type}:${item.entity_id}`));
      const unqueued = changed
        .map(({ id, entityType }) => `${entityType}:${id}`)
        .filter((key) => !queued.has(key));
      expect(unqueued, "written rows without a matching sync item").toEqual([]);
      for (const item of items) {
        expect(scenario.entityTypes).toContain(item.entity_type);
      }
    });

    it("writes nothing when the outbox write fails", async () => {
      const call = await scenario.prepare();
      await db.syncQueue.clear();
      const before = await dumpEntityTables();
      const outboxSpies = rejectOutboxWrites();
      expect(await callFails(call)).toBe(true);
      const outboxAttempts = outboxSpies.reduce((total, spy) => total + spy.mock.calls.length, 0);
      for (const spy of outboxSpies) spy.mockRestore();
      expect(outboxAttempts, "the call never reached the outbox write").toBeGreaterThan(0);
      expect(await dumpEntityTables()).toEqual(before);
    });
  });
});
