# Debt Sync Defects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Debts, internal debts and debt payments round-trip between devices through the standard outbox and pull paths, and debt rows already on devices are repaired.

**Architecture:** Debt mutations become two-phase: an async _prepare_ step reads Dexie and builds rows, local audit events and sync queue items (no writes), then one Dexie `rw` transaction applies the resulting `DebtWriteSet`. Transaction writes that touch a debt apply their own row and queue item plus the debt write set in the same transaction. Queue payloads are server-shape rows typed against the generated `Insert` types. The pull path gains three tables with per-table cursor columns, and a one-shot `repairLegacyDebtIds` re-keys pre-existing nanoid rows before auto-sync starts.

**Tech Stack:** TypeScript, Dexie 4 (fake-indexeddb in vitest), Zod, Supabase JS, TanStack Query, vitest.

**Spec:** `docs/plans/2026-10-06-debt-sync-defects-design.md` (approved 2026-10-06).

## Global Constraints

- No migration. No change to the `supabase_realtime` publication. No debts route or UI.
- New ids are `crypto.randomUUID()`. `nanoid` stays only in `src/lib/import-drafts.ts` and `src/lib/event-compactor.ts`.
- Queue payloads are rows in server shape: exactly the columns of `AppDatabase["public"]["Tables"][T]["Insert"]` for `debts`, `internal_debts`, `debt_payments`. No envelope, no `actor_user_id`.
- Debt events stay a local audit log in `db.events` and are never queued.
- Only `src/lib/sync/` writes to Supabase; the processor is unchanged.
- Money is `Cents`; `asCents` only in the data layer. Transaction `date` and `payment_date` are local `yyyy-MM-dd`.
- No `!` in production code under `tsconfig.strict.json` (covers `src/lib/{sync,offline,debts}`); narrow with a guard.
- `DEFAULT_HOUSEHOLD_ID` has exactly one definition: `src/lib/household.ts`.
- Conventional Commits; no Co-Authored-By or Claude Session lines.
- Gates (spec section 6): `npx tsc --noEmit -p tsconfig.json`, `npx tsc --noEmit -p tsconfig.tests.json`, `npx tsc --noEmit -p tsconfig.strict.json`, `npm run lint`, `npx vitest run`, `npm run build`, `npm run size`, `npm run test:e2e:smoke`.

## File Structure

| File                                                                  | Responsibility                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/lib/household.ts` (new)                                          | The one `DEFAULT_HOUSEHOLD_ID` export                               |
| `src/lib/offline/syncQueue.ts`                                        | Strictly increasing queue `created_at` per tab                      |
| `src/lib/debts/payloads.ts` (new)                                     | Row → server `Insert` projections                                   |
| `src/lib/debts/outbox.ts` (new)                                       | `DebtWriteSet`, prepare helpers, apply/commit                       |
| `src/lib/debts/ledgerView.ts` (new)                                   | Working copy of debt rows and balances for chained prepares         |
| `src/lib/debts/crud.ts`, `status.ts`, `payments.ts`, `reversals.ts`   | Prepare + commit wrappers, `userId` threaded through                |
| `src/lib/debts/events.ts`, `sync.ts`, `index.ts`                      | Envelope/queue code removed; read helpers stay                      |
| `src/lib/debts/repair.ts` (new)                                       | `repairLegacyDebtIds(userId)`                                       |
| `src/lib/offline/transactions.ts`                                     | Transaction + debt writes in one Dexie transaction                  |
| `src/lib/validations/syncRows.ts`                                     | Zod schemas for the three debt tables                               |
| `src/lib/realtime-sync.ts`                                            | Six tables, FK order, per-table cursor, insert-only payments        |
| `src/routes/__root.tsx`                                               | Run the repair before `autoSyncManager.start`                       |
| `src/components/TransactionFormDialog.tsx`                            | Debt picker reads by household                                      |
| `src/lib/delete-transaction.ts`, `src/components/TransactionList.tsx` | Stop calling `handleTransactionDelete` (the offline delete owns it) |
| `src/components/debts/forms/*`                                        | Pass `userId` from the auth store                                   |
| `eslint.config.js`                                                    | Ban `nanoid` under `src/lib/debts/**` and `src/lib/offline/**`      |

## Progress

- [x] Task 0: Branch and baseline (branch cut at `59848c3`; baseline vitest 84 files / 1079 tests, tsc app 0, tsc strict 0)
- [ ] Task 1: One household constant; picker reads by household
- [ ] Task 2: Strictly ordered queue timestamps
- [ ] Task 3: Server-shape payload projections
- [ ] Task 4: Debt write sets (outbox core)
- [ ] Task 5: CRUD on write sets
- [ ] Task 6: Payments, reversals and status on write sets
- [ ] Task 7: Atomic transaction + debt writes
- [ ] Task 8: Remove the envelope path; ban nanoid
- [ ] Task 9: Pull schemas for debt tables
- [ ] Task 10: Realtime and catch-up for debt tables
- [ ] Task 11: Legacy id repair
- [ ] Task 12: Local-stack integration test
- [ ] Task 13: Acceptance, docs, merge

---

### Task 0: Branch and baseline

**Files:** none

- [ ] **Step 1: Confirm a clean `main` and cut the branch**

```bash
git status -sb            # expect: ## main...origin/main (ahead count only if docs are unpushed)
git switch -c debt-sync-defects
```

- [ ] **Step 2: Record baseline gates**

```bash
npx vitest run 2>&1 | tail -5
npx tsc --noEmit -p tsconfig.json; echo "tsc app exit $?"
npx tsc --noEmit -p tsconfig.strict.json; echo "tsc strict exit $?"
```

Expected: vitest all passing (1079 at `d9417fb`), both tsc exit 0. Write the counts into this plan's Acceptance results section when Task 13 runs.

---

### Task 1: One household constant; picker reads by household

**Files:**

- Create: `src/lib/household.ts`
- Modify: `src/lib/offline/{accounts,budgets,categories,syncQueue,transactions}.ts`, `src/lib/dexie/deviceManager.ts` (delete each local `DEFAULT_HOUSEHOLD_ID` and its doc comment; import the shared one)
- Modify: `src/components/TransactionFormDialog.tsx:113-130`
- Test: `src/components/TransactionFormDialog.test.tsx`

**Interfaces:**

- Produces: `DEFAULT_HOUSEHOLD_ID: string` from `@/lib/household`

- [ ] **Step 1: Write the failing test** (append inside the file's top-level `describe`; add the two imports at the top)

```tsx
import { listDebts } from "@/lib/debts/crud";
import { DEFAULT_HOUSEHOLD_ID } from "@/lib/household";

it("loads the debt picker by household, not by user", async () => {
  await renderDialog();
  await waitFor(() => {
    expect(vi.mocked(listDebts)).toHaveBeenCalledWith(DEFAULT_HOUSEHOLD_ID, "external", {
      status: "active",
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/TransactionFormDialog.test.tsx -t "debt picker"`
Expected: FAIL (cannot resolve `@/lib/household`).

- [ ] **Step 3: Create the constant**

```ts
// src/lib/household.ts
/** Single-household MVP; multi-household is deferred (DECISIONS.md #61). */
export const DEFAULT_HOUSEHOLD_ID = "00000000-0000-0000-0000-000000000001";
```

In each of the six modules, delete the local `const DEFAULT_HOUSEHOLD_ID = ...` with its doc comment and add `import { DEFAULT_HOUSEHOLD_ID } from "@/lib/household";`.

- [ ] **Step 4: Point the picker at the household**

In `TransactionFormDialog.tsx` replace the debts query with:

```tsx
  const { data: debts } = useQuery({
    queryKey: ["debts", DEFAULT_HOUSEHOLD_ID, "external", "active"],
    queryFn: async () => {
      const allDebts = await listDebts(DEFAULT_HOUSEHOLD_ID, "external", { status: "active" });
```

(the rest of the `queryFn` body is unchanged; add the `@/lib/household` import).

- [ ] **Step 5: Verify**

```bash
npx vitest run src/components/TransactionFormDialog.test.tsx
grep -rn "DEFAULT_HOUSEHOLD_ID *=" src
```

Expected: tests PASS; grep prints exactly one line, `src/lib/household.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/household.ts src/lib/offline src/lib/dexie/deviceManager.ts src/components/TransactionFormDialog.tsx src/components/TransactionFormDialog.test.tsx
git commit -m "fix(debts): read the debt picker by household id"
```

---

### Task 2: Strictly ordered queue timestamps

Debt writes enqueue two or three items in one call, and their order matters (`debt_payments.transaction_id` references `transactions`). `getPendingQueueItems` sorts by `created_at`; on a same-millisecond tie the order falls back to Dexie's index order, which is the random UUID primary key.

**Files:**

- Modify: `src/lib/offline/syncQueue.ts:93`
- Test: `src/lib/offline/syncQueue.test.ts`

**Interfaces:**

- Produces: `buildSyncQueueItem` guarantees `created_at` strictly increases across calls in a tab.

- [ ] **Step 1: Write the failing test** (add `vi` to the vitest import if absent; add `buildSyncQueueItem` to the module import)

```ts
describe("buildSyncQueueItem ordering", () => {
  it("stamps strictly increasing created_at within one millisecond", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-06T00:00:00.000Z"));
    try {
      const first = await buildSyncQueueItem(
        "transaction",
        crypto.randomUUID(),
        "create",
        {},
        "user-1"
      );
      const second = await buildSyncQueueItem(
        "debt_payment",
        crypto.randomUUID(),
        "create",
        {},
        "user-1"
      );
      expect(second.created_at > first.created_at).toBe(true);
      expect(second.updated_at).toBe(second.created_at);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/offline/syncQueue.test.ts -t "strictly increasing"`
Expected: FAIL (`expected false to be true`): both items share a timestamp.

- [ ] **Step 3: Implement** (above `buildSyncQueueItem`)

```ts
let lastQueueTimestampMs = 0;

/** FIFO sorts on created_at; a same-millisecond tie would fall back to random primary-key order. */
function nextQueueTimestamp(): string {
  lastQueueTimestampMs = Math.max(Date.now(), lastQueueTimestampMs + 1);
  return new Date(lastQueueTimestampMs).toISOString();
}
```

and in `buildSyncQueueItem` replace `const now = new Date().toISOString();` with `const now = nextQueueTimestamp();`.

- [ ] **Step 4: Verify**

Run: `npx vitest run src/lib/offline/syncQueue.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/offline/syncQueue.ts src/lib/offline/syncQueue.test.ts
git commit -m "fix(sync): keep queue items in build order within a millisecond"
```

---

### Task 3: Server-shape payload projections

**Files:**

- Create: `src/lib/debts/payloads.ts`
- Modify: `src/types/debt.ts` (`DebtPayment.idempotency_key` becomes optional)
- Test: `src/lib/debts/__tests__/payloads.test.ts`

**Interfaces:**

- Produces:
  - `toDebtInsert(debt: Debt): DebtInsert`
  - `toInternalDebtInsert(debt: InternalDebt): InternalDebtInsert`
  - `toDebtPaymentInsert(payment: DebtPayment): DebtPaymentInsert`
  - types `DebtInsert`, `InternalDebtInsert`, `DebtPaymentInsert`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/debts/__tests__/payloads.test.ts
import { describe, expect, it } from "vitest";
import { toDebtInsert, toDebtPaymentInsert, toInternalDebtInsert } from "../payloads";
import { createTestDebt, createTestInternalDebt, createTestPayment } from "./test-utils";

const keys = (row: object) => Object.keys(row).sort();

describe("debt queue payloads", () => {
  it("debt insert carries exactly the server columns", () => {
    expect(keys(toDebtInsert(createTestDebt()))).toEqual([
      "closed_at",
      "created_at",
      "household_id",
      "id",
      "name",
      "original_amount_cents",
      "status",
      "updated_at",
    ]);
  });

  it("internal debt insert carries exactly the server columns", () => {
    expect(keys(toInternalDebtInsert(createTestInternalDebt()))).toEqual([
      "closed_at",
      "created_at",
      "from_display_name",
      "from_id",
      "from_type",
      "household_id",
      "id",
      "name",
      "original_amount_cents",
      "status",
      "to_display_name",
      "to_id",
      "to_type",
      "updated_at",
    ]);
  });

  it("payment insert drops local-only fields and nulls absent links", () => {
    const insert = toDebtPaymentInsert(createTestPayment({ internal_debt_id: undefined }));
    expect(keys(insert)).toEqual([
      "adjustment_reason",
      "amount_cents",
      "created_at",
      "debt_id",
      "device_id",
      "household_id",
      "id",
      "internal_debt_id",
      "is_overpayment",
      "is_reversal",
      "overpayment_amount",
      "payment_date",
      "reverses_payment_id",
      "transaction_id",
    ]);
    expect(insert.internal_debt_id).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/debts/__tests__/payloads.test.ts`
Expected: FAIL (cannot resolve `../payloads`).

- [ ] **Step 3: Implement**

```ts
// src/lib/debts/payloads.ts
import type { AppDatabase } from "@/types/app-database";
import type { Debt, DebtPayment, InternalDebt } from "@/types/debt";

type Tables = AppDatabase["public"]["Tables"];
export type DebtInsert = Tables["debts"]["Insert"];
export type InternalDebtInsert = Tables["internal_debts"]["Insert"];
export type DebtPaymentInsert = Tables["debt_payments"]["Insert"];

export function toDebtInsert(debt: Debt): DebtInsert {
  return {
    id: debt.id,
    household_id: debt.household_id,
    name: debt.name,
    original_amount_cents: debt.original_amount_cents,
    status: debt.status,
    created_at: debt.created_at,
    updated_at: debt.updated_at,
    closed_at: debt.closed_at ?? null,
  };
}

export function toInternalDebtInsert(debt: InternalDebt): InternalDebtInsert {
  return {
    id: debt.id,
    household_id: debt.household_id,
    name: debt.name,
    original_amount_cents: debt.original_amount_cents,
    from_type: debt.from_type,
    from_id: debt.from_id,
    from_display_name: debt.from_display_name,
    to_type: debt.to_type,
    to_id: debt.to_id,
    to_display_name: debt.to_display_name,
    status: debt.status,
    created_at: debt.created_at,
    updated_at: debt.updated_at,
    closed_at: debt.closed_at ?? null,
  };
}

/** `updated_at` and `idempotency_key` are local-only; the server ledger is append-only. */
export function toDebtPaymentInsert(payment: DebtPayment): DebtPaymentInsert {
  return {
    id: payment.id,
    household_id: payment.household_id,
    debt_id: payment.debt_id ?? null,
    internal_debt_id: payment.internal_debt_id ?? null,
    transaction_id: payment.transaction_id,
    amount_cents: payment.amount_cents,
    payment_date: payment.payment_date,
    device_id: payment.device_id,
    is_reversal: payment.is_reversal,
    reverses_payment_id: payment.reverses_payment_id ?? null,
    adjustment_reason: payment.adjustment_reason ?? null,
    is_overpayment: payment.is_overpayment ?? false,
    overpayment_amount: payment.overpayment_amount ?? null,
    created_at: payment.created_at,
  };
}
```

The return annotations make an extra key in any literal a compile error (spec section 6).

In `src/types/debt.ts`, change `idempotency_key: string;` on `DebtPayment` to `idempotency_key?: string;` and its comment to `/** Set on rows written before 2026-10; the outbox event now carries the key. */`. Rows pulled from the server have no key.

- [ ] **Step 4: Verify**

```bash
npx vitest run src/lib/debts/__tests__/payloads.test.ts
npx tsc --noEmit -p tsconfig.json; echo "exit $?"
```

Expected: PASS; tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/debts/payloads.ts src/lib/debts/__tests__/payloads.test.ts src/types/debt.ts
git commit -m "feat(debts): server-shape queue payloads for debt tables"
```

---

### Task 4: Debt write sets (outbox core)

**Files:**

- Create: `src/lib/debts/outbox.ts`
- Test: `src/lib/debts/__tests__/outbox.test.ts`

**Interfaces:**

- Consumes: `buildSyncQueueItem` (`@/lib/offline/syncQueue`), `toDebtInsert` / `toInternalDebtInsert` / `toDebtPaymentInsert`, `calculateDelta` (`./events`)
- Produces:
  - `type DebtKind = "external" | "internal"`
  - `interface DebtWriteSet { debtPuts: Debt[]; internalDebtPuts: InternalDebt[]; debtDeletes: string[]; internalDebtDeletes: string[]; paymentAdds: DebtPayment[]; events: TransactionEvent[]; queueItems: SyncQueueItem[] }`
  - `emptyWriteSet(): DebtWriteSet`, `mergeWriteSets(...sets: DebtWriteSet[]): DebtWriteSet`
  - `prepareDebtCreate(debt: Debt | InternalDebt, userId: string): Promise<DebtWriteSet>`
  - `prepareDebtUpdate<T extends Debt | InternalDebt>(before: T, after: T, userId: string): Promise<DebtWriteSet>`
  - `prepareDebtDelete(debt: Debt | InternalDebt, userId: string): Promise<DebtWriteSet>`
  - `preparePaymentAdd(payment: DebtPayment, userId: string): Promise<DebtWriteSet>`
  - `debtWriteTables()`: the Dexie tables a write set touches
  - `applyDebtWriteSet(set): Promise<void>` (call inside a transaction over `debtWriteTables()`)
  - `commitDebtWriteSet(set): Promise<void>` (opens its own transaction)

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/debts/__tests__/outbox.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/dexie/db";
import {
  commitDebtWriteSet,
  mergeWriteSets,
  prepareDebtCreate,
  prepareDebtUpdate,
  preparePaymentAdd,
} from "../outbox";
import { toDebtInsert } from "../payloads";
import { createTestDebt, createTestInternalDebt, createTestPayment } from "./test-utils";

const USER_ID = "12345678-1234-5678-1234-567812345678";

describe("debt write sets", () => {
  beforeEach(async () => {
    await Promise.all([
      db.debts.clear(),
      db.internalDebts.clear(),
      db.debtPayments.clear(),
      db.events.clear(),
      db.syncQueue.clear(),
    ]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("prepares a create with a server-shape payload and a matching local event", async () => {
    const debt = createTestDebt({ id: crypto.randomUUID() });
    const set = await prepareDebtCreate(debt, USER_ID);

    expect(set.debtPuts).toEqual([debt]);
    const [item] = set.queueItems;
    expect(item?.entity_type).toBe("debt");
    expect(item?.operation.payload).toEqual(toDebtInsert(debt));
    expect(set.events[0]?.idempotency_key).toBe(item?.operation.idempotencyKey);
    expect(await db.syncQueue.count()).toBe(0); // prepare never writes
  });

  it("routes internal debts by shape", async () => {
    const debt = createTestInternalDebt({ id: crypto.randomUUID() });
    const set = await prepareDebtCreate(debt, USER_ID);
    expect(set.internalDebtPuts).toEqual([debt]);
    expect(set.queueItems[0]?.entity_type).toBe("internal_debt");
  });

  it("queues only the changed columns on update", async () => {
    const before = createTestDebt({ id: crypto.randomUUID() });
    const after = { ...before, name: "Renamed", updated_at: "2026-10-06T01:00:00.000Z" };
    const set = await prepareDebtUpdate(before, after, USER_ID);
    expect(Object.keys(set.queueItems[0]?.operation.payload ?? {}).sort()).toEqual([
      "name",
      "updated_at",
    ]);
  });

  it("commits rows, events and queue items together", async () => {
    const debt = createTestDebt({ id: crypto.randomUUID() });
    const payment = createTestPayment({ id: crypto.randomUUID(), debt_id: debt.id });
    await commitDebtWriteSet(
      mergeWriteSets(
        await prepareDebtCreate(debt, USER_ID),
        await preparePaymentAdd(payment, USER_ID)
      )
    );
    expect(await db.debts.count()).toBe(1);
    expect(await db.debtPayments.count()).toBe(1);
    expect(await db.events.count()).toBe(2);
    expect(await db.syncQueue.count()).toBe(2);
  });

  it("writes nothing when the transaction throws", async () => {
    const debt = createTestDebt({ id: crypto.randomUUID() });
    const set = await prepareDebtCreate(debt, USER_ID);
    vi.spyOn(db.syncQueue, "bulkAdd").mockRejectedValueOnce(new Error("boom"));

    await expect(commitDebtWriteSet(set)).rejects.toThrow("boom");
    expect(await db.debts.count()).toBe(0);
    expect(await db.events.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/debts/__tests__/outbox.test.ts`
Expected: FAIL (cannot resolve `../outbox`).

- [ ] **Step 3: Implement**

```ts
// src/lib/debts/outbox.ts
/**
 * Debt writes follow the outbox pattern in two phases: prepare (async reads,
 * clocks, idempotency keys; no writes) and apply (one Dexie rw transaction).
 * Callers that also write a transaction row apply both inside their own
 * transaction over debtWriteTables() plus db.transactions.
 */
import { db, type TransactionEvent } from "@/lib/dexie/db";
import { buildSyncQueueItem } from "@/lib/offline/syncQueue";
import type { Debt, DebtPayment, InternalDebt } from "@/types/debt";
import type { EntityType, OperationType, SyncQueueItem } from "@/types/sync";
import { calculateDelta } from "./events";
import { toDebtInsert, toDebtPaymentInsert, toInternalDebtInsert } from "./payloads";

export type DebtKind = "external" | "internal";

export interface DebtWriteSet {
  debtPuts: Debt[];
  internalDebtPuts: InternalDebt[];
  debtDeletes: string[];
  internalDebtDeletes: string[];
  paymentAdds: DebtPayment[];
  events: TransactionEvent[];
  queueItems: SyncQueueItem[];
}

export function emptyWriteSet(): DebtWriteSet {
  return {
    debtPuts: [],
    internalDebtPuts: [],
    debtDeletes: [],
    internalDebtDeletes: [],
    paymentAdds: [],
    events: [],
    queueItems: [],
  };
}

export function mergeWriteSets(...sets: DebtWriteSet[]): DebtWriteSet {
  const merged = emptyWriteSet();
  for (const set of sets) {
    merged.debtPuts.push(...set.debtPuts);
    merged.internalDebtPuts.push(...set.internalDebtPuts);
    merged.debtDeletes.push(...set.debtDeletes);
    merged.internalDebtDeletes.push(...set.internalDebtDeletes);
    merged.paymentAdds.push(...set.paymentAdds);
    merged.events.push(...set.events);
    merged.queueItems.push(...set.queueItems);
  }
  return merged;
}

function isInternalDebt(debt: Debt | InternalDebt): debt is InternalDebt {
  return "from_id" in debt;
}

/** The local audit event reuses the queue item's clock and idempotency key. */
async function outboxEntry(
  entityType: Extract<EntityType, "debt" | "internal_debt" | "debt_payment">,
  entityId: string,
  op: OperationType,
  payload: Record<string, unknown>,
  householdId: string,
  userId: string
): Promise<{ item: SyncQueueItem; event: TransactionEvent }> {
  const item = await buildSyncQueueItem(entityType, entityId, op, payload, userId);
  const event: TransactionEvent = {
    id: crypto.randomUUID(),
    household_id: householdId,
    entity_type: entityType,
    entity_id: entityId,
    op,
    payload,
    idempotency_key: item.operation.idempotencyKey,
    event_version: 1,
    actor_user_id: userId,
    device_id: item.device_id,
    lamport_clock: item.operation.lamportClock,
    vector_clock: { [item.device_id]: item.operation.lamportClock },
    timestamp: item.created_at,
  };
  return { item, event };
}

function withRow(debt: Debt | InternalDebt): DebtWriteSet {
  const set = emptyWriteSet();
  if (isInternalDebt(debt)) set.internalDebtPuts.push(debt);
  else set.debtPuts.push(debt);
  return set;
}

export async function prepareDebtCreate(
  debt: Debt | InternalDebt,
  userId: string
): Promise<DebtWriteSet> {
  const { item, event } = isInternalDebt(debt)
    ? await outboxEntry(
        "internal_debt",
        debt.id,
        "create",
        toInternalDebtInsert(debt),
        debt.household_id,
        userId
      )
    : await outboxEntry("debt", debt.id, "create", toDebtInsert(debt), debt.household_id, userId);
  const set = withRow(debt);
  set.events.push(event);
  set.queueItems.push(item);
  return set;
}

export async function prepareDebtUpdate<T extends Debt | InternalDebt>(
  before: T,
  after: T,
  userId: string
): Promise<DebtWriteSet> {
  // Changed columns only; Debt and InternalDebt keys are all server columns
  // (payloads.test.ts pins that), and a cleared field goes out as null
  const payload: Record<string, unknown> = {
    ...calculateDelta<Debt | InternalDebt>(before, after),
  };
  if (Object.keys(payload).length === 0) return emptyWriteSet();

  const entityType = isInternalDebt(after) ? "internal_debt" : "debt";
  const { item, event } = await outboxEntry(
    entityType,
    after.id,
    "update",
    payload,
    after.household_id,
    userId
  );
  const set = withRow(after);
  set.events.push(event);
  set.queueItems.push(item);
  return set;
}

export async function prepareDebtDelete(
  debt: Debt | InternalDebt,
  userId: string
): Promise<DebtWriteSet> {
  const set = emptyWriteSet();
  const entityType = isInternalDebt(debt) ? "internal_debt" : "debt";
  if (isInternalDebt(debt)) set.internalDebtDeletes.push(debt.id);
  else set.debtDeletes.push(debt.id);
  const { item, event } = await outboxEntry(
    entityType,
    debt.id,
    "delete",
    { id: debt.id },
    debt.household_id,
    userId
  );
  set.events.push(event);
  set.queueItems.push(item);
  return set;
}

export async function preparePaymentAdd(
  payment: DebtPayment,
  userId: string
): Promise<DebtWriteSet> {
  const { item, event } = await outboxEntry(
    "debt_payment",
    payment.id,
    "create",
    toDebtPaymentInsert(payment),
    payment.household_id,
    userId
  );
  const set = emptyWriteSet();
  set.paymentAdds.push(payment);
  set.events.push(event);
  set.queueItems.push(item);
  return set;
}

export function debtWriteTables() {
  return [db.debts, db.internalDebts, db.debtPayments, db.events, db.syncQueue];
}

export async function applyDebtWriteSet(set: DebtWriteSet): Promise<void> {
  if (set.debtPuts.length) await db.debts.bulkPut(set.debtPuts);
  if (set.internalDebtPuts.length) await db.internalDebts.bulkPut(set.internalDebtPuts);
  if (set.debtDeletes.length) await db.debts.bulkDelete(set.debtDeletes);
  if (set.internalDebtDeletes.length) await db.internalDebts.bulkDelete(set.internalDebtDeletes);
  if (set.paymentAdds.length) await db.debtPayments.bulkAdd(set.paymentAdds);
  if (set.events.length) await db.events.bulkAdd(set.events);
  if (set.queueItems.length) await db.syncQueue.bulkAdd(set.queueItems);
}

export async function commitDebtWriteSet(set: DebtWriteSet): Promise<void> {
  await db.transaction("rw", debtWriteTables(), () => applyDebtWriteSet(set));
}
```

If `outboxEntry`'s inline ternary in `prepareDebtCreate` exceeds Prettier's width it will be reflowed by the pre-commit hook; that is fine.

- [ ] **Step 4: Verify**

```bash
npx vitest run src/lib/debts/__tests__/outbox.test.ts
npx tsc --noEmit -p tsconfig.strict.json; echo "exit $?"
```

Expected: 5 PASS; strict tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/debts/outbox.ts src/lib/debts/__tests__/outbox.test.ts
git commit -m "feat(debts): atomic debt write sets for the outbox"
```

---

### Task 5: CRUD on write sets

**Files:**

- Modify: `src/lib/debts/crud.ts` (all create/update/delete functions)
- Modify: `src/components/debts/forms/{CreateExternalDebtForm,CreateInternalDebtForm,EditExternalDebtForm}.tsx`
- Modify: `src/lib/debts/__tests__/crud.test.ts` (signature updates)
- Test: `src/lib/debts/__tests__/crud.outbox.test.ts`

**Interfaces:**

- Consumes: Task 4 `prepareDebtCreate`, `prepareDebtUpdate`, `prepareDebtDelete`, `commitDebtWriteSet`
- Produces (new signatures):
  - `createExternalDebt(data: DebtFormData, userId: string): Promise<Debt>`
  - `createInternalDebt(data: InternalDebtFormData, userId: string): Promise<InternalDebt>`
  - `updateDebtName(debtId, type, newName, userId): Promise<void>`
  - `archiveDebt(debtId, type, userId)`, `unarchiveDebt(debtId, type, userId)`, `deleteDebt(debtId, type, userId)`: `Promise<void>`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/debts/__tests__/crud.outbox.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, type LocalAccount } from "@/lib/dexie/db";
import { createExternalDebt, createInternalDebt, deleteDebt, updateDebtName } from "../crud";
import { cents } from "@/test/cents";

const USER_ID = "12345678-1234-5678-1234-567812345678";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function account(id: string): LocalAccount {
  const now = "2026-10-01T00:00:00.000Z";
  return {
    id,
    household_id: "household-1",
    name: id,
    type: "bank",
    initial_balance_cents: cents(0),
    currency_code: "PHP",
    visibility: "household",
    color: "#3B82F6",
    icon: "wallet",
    sort_order: 0,
    is_active: true,
    created_at: now,
    updated_at: now,
  };
}

describe("debt CRUD outbox writes", () => {
  beforeEach(async () => {
    await Promise.all([
      db.debts.clear(),
      db.internalDebts.clear(),
      db.debtPayments.clear(),
      db.events.clear(),
      db.syncQueue.clear(),
      db.accounts.clear(),
    ]);
  });
  afterEach(() => vi.restoreAllMocks());

  const input = {
    name: "Car Loan",
    original_amount_cents: cents(500000),
    household_id: "household-1",
  };

  it("creates an external debt with a UUID, one event and one create item", async () => {
    const debt = await createExternalDebt(input, USER_ID);
    expect(debt.id).toMatch(UUID);
    const [item] = await db.syncQueue.toArray();
    expect(item).toMatchObject({ entity_type: "debt", entity_id: debt.id, user_id: USER_ID });
    expect(item?.operation.op).toBe("create");
    expect(await db.events.where("entity_id").equals(debt.id).count()).toBe(1);
  });

  it("creates an internal debt atomically", async () => {
    await db.accounts.bulkAdd([account("acc-from"), account("acc-to")]);
    const debt = await createInternalDebt(
      { ...input, from_type: "account", from_id: "acc-from", to_type: "account", to_id: "acc-to" },
      USER_ID
    );
    expect(debt.id).toMatch(UUID);
    expect((await db.syncQueue.toArray()).map((i) => i.entity_type)).toEqual(["internal_debt"]);
  });

  it("leaves nothing behind when the create transaction throws", async () => {
    vi.spyOn(db.syncQueue, "bulkAdd").mockRejectedValueOnce(new Error("boom"));
    await expect(createExternalDebt(input, USER_ID)).rejects.toThrow("boom");
    expect(await db.debts.count()).toBe(0);
    expect(await db.events.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it("queues an update with the changed columns only", async () => {
    const debt = await createExternalDebt(input, USER_ID);
    await db.syncQueue.clear();
    await updateDebtName(debt.id, "external", "Truck Loan", USER_ID);
    const [item] = await db.syncQueue.toArray();
    expect(item?.operation.op).toBe("update");
    expect(Object.keys(item?.operation.payload ?? {}).sort()).toEqual(["name", "updated_at"]);
    expect((await db.debts.get(debt.id))?.name).toBe("Truck Loan");
  });

  it("queues a delete and removes the row", async () => {
    const debt = await createExternalDebt(input, USER_ID);
    await db.syncQueue.clear();
    await deleteDebt(debt.id, "external", USER_ID);
    expect(await db.debts.get(debt.id)).toBeUndefined();
    expect((await db.syncQueue.toArray())[0]?.operation).toMatchObject({
      op: "delete",
      payload: { id: debt.id },
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/debts/__tests__/crud.outbox.test.ts`
Expected: FAIL (ids are nanoid; the queue holds envelope items from `addDebtEventToSyncQueue`, or none because `getCurrentUserId` throws unauthenticated).

- [ ] **Step 3: Rewrite the CRUD writers**

In `crud.ts`: remove `import { nanoid } from "nanoid"`, import `{ commitDebtWriteSet, prepareDebtCreate, prepareDebtDelete, prepareDebtUpdate }` from `./outbox`, and replace `createDebtEvent, createInternalDebtEvent, calculateDelta` in the `./events` import with nothing (drop the import if empty).

```ts
export async function createExternalDebt(data: DebtFormData, userId: string): Promise<Debt> {
  const validation = await validateDebtCreation(data);
  if (!validation.valid) {
    throw new Error(validation.errors.join(", "));
  }

  const now = new Date().toISOString();
  const debt: Debt = {
    id: crypto.randomUUID(),
    household_id: data.household_id,
    name: data.name.trim(),
    original_amount_cents: data.original_amount_cents,
    status: "active",
    created_at: now,
    updated_at: now,
  };

  await commitDebtWriteSet(await prepareDebtCreate(debt, userId));

  console.log("[Debt Created]", debt.name, `(₱${(debt.original_amount_cents / 100).toFixed(2)})`);
  return debt;
}
```

`createInternalDebt(data, userId)`: same change (keep the validation and display-name lookup; `id: crypto.randomUUID()`, one `now`, then `await commitDebtWriteSet(await prepareDebtCreate(debt, userId))` in place of `db.internalDebts.add` + `createInternalDebtEvent`).

`updateDebtName(debtId, type, newName, userId)`: keep the lookup and validation, then

```ts
const updatedDebt = { ...debt, name: newName.trim(), updated_at: new Date().toISOString() };
await commitDebtWriteSet(await prepareDebtUpdate(debt, updatedDebt, userId));
```

replacing the `table.update` call and the delta/event block.

`archiveDebt(debtId, type, userId)`: build `updatedDebt` as today, then `await commitDebtWriteSet(await prepareDebtUpdate(debt, updatedDebt, userId));` replacing `table.update` and the event block.

`unarchiveDebt(debtId, type, userId)`: same pattern with its `updatedDebt`.

`deleteDebt(debtId, type, userId)`: keep validation and lookup, then `await commitDebtWriteSet(await prepareDebtDelete(debt, userId));` replacing the event and `table.delete`.

- [ ] **Step 4: Thread `userId` through the forms**

In each of the three forms add `import { useAuthStore } from "@/stores/authStore";`, read `const userId = useAuthStore((state) => state.user?.id);` in the component body, and in the submit handler before the write:

```tsx
if (!userId) {
  toast.error("Sign in to save debts");
  return;
}
```

then pass `userId` as the last argument (`createExternalDebt(data, userId)`, `createInternalDebt(..., userId)`, `updateDebtName(debt.id, "external", data.name.trim(), userId)`, `archiveDebt(debt.id, "external", userId)`).

- [ ] **Step 5: Update the existing CRUD suite**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "crud.test"`
Expected: TS2554 ("Expected 3 arguments, but got 2" and similar) at each changed call. Add a trailing `"test-user-id"` argument at every listed call until the grep prints nothing.

- [ ] **Step 6: Verify**

```bash
npx vitest run src/lib/debts/__tests__/crud.outbox.test.ts src/lib/debts/__tests__/crud.test.ts
npx tsc --noEmit -p tsconfig.json; echo "exit $?"
npx tsc --noEmit -p tsconfig.strict.json; echo "exit $?"
```

Expected: all PASS; both tsc exit 0. If a `crud.test.ts` case asserts on `syncQueue` envelope fields (`payload.payload`, `actor_user_id`), change it to the server-shape payload (`toDebtInsert(debt)`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/debts/crud.ts src/lib/debts/__tests__ src/components/debts/forms
git commit -m "fix(debts): write debts through the outbox with UUIDs"
```

---

### Task 6: Payments, reversals and status on write sets

**Files:**

- Create: `src/lib/debts/ledgerView.ts`
- Modify: `src/lib/debts/status.ts`, `src/lib/debts/payments.ts`, `src/lib/debts/reversals.ts`, `src/lib/debts/index.ts`
- Modify: `src/lib/offline/transactions.ts` (pass `userId`; still non-atomic until Task 7)
- Modify: `src/lib/delete-transaction.ts`, `src/components/TransactionList.tsx` (drop the UI-level reversal)
- Modify tests: `src/lib/debts/__tests__/{payments,reversals,status}.test.ts`, `src/lib/offline/transactions.test.ts`, `src/components/TransactionList.test.tsx`, `src/__tests__/transactions-route.test.tsx`
- Test: `src/lib/debts/__tests__/payments.outbox.test.ts`

**Interfaces:**

- Consumes: Task 4 write-set API
- Produces:
  - `class DebtLedgerView { debt(kind, id); balance(kind, id); setDebt(row); recordPayment(id, amountCents) }`
  - `nextDebtStatus<T extends Debt | InternalDebt>(debt: T, balance: number, now: string): T | null`
  - `updateDebtStatusFromBalance(debtId, type, userId, precomputedBalance?): Promise<boolean>`; `updateMultipleDebtStatuses(ids, type, userId)`; `recoverInvalidDebtStates(type, userId)`
  - `prepareDebtPayment(data: ProcessPaymentData, userId: string, view?: DebtLedgerView): Promise<{ writeSet: DebtWriteSet; result: PaymentResult }>`
  - `processDebtPayment(data, userId): Promise<PaymentResult>`
  - `prepareReversal(data: CreateReversalData, userId, view?): Promise<{ writeSet; result: ReversalResult }>`; `reverseDebtPayment(data, userId): Promise<ReversalResult>`
  - `prepareTransactionEdit(data: TransactionEditData, userId): Promise<{ writeSet; operations; reversalCreated; paymentCreated }>`; `handleTransactionEdit(data, userId)` (same result minus `writeSet`)
  - `prepareTransactionDelete(data: TransactionDeleteData, userId): Promise<{ writeSet; result: ReversalResult | undefined }>`; `handleTransactionDelete(data, userId): Promise<ReversalResult | undefined>`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/debts/__tests__/payments.outbox.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/dexie/db";
import { createExternalDebt } from "../crud";
import { processDebtPayment } from "../payments";
import { handleTransactionEdit, reverseDebtPayment } from "../reversals";
import { cents } from "@/test/cents";

const USER_ID = "12345678-1234-5678-1234-567812345678";

async function newDebt(amount = 10000) {
  const debt = await createExternalDebt(
    {
      name: `Loan ${crypto.randomUUID()}`,
      original_amount_cents: cents(amount),
      household_id: "household-1",
    },
    USER_ID
  );
  await db.syncQueue.clear();
  await db.events.clear();
  return debt;
}

const pay = (debtId: string, amount: number, transactionId = crypto.randomUUID()) =>
  processDebtPayment(
    {
      transaction_id: transactionId,
      amount_cents: cents(amount),
      payment_date: "2026-10-06",
      debt_id: debtId,
      household_id: "household-1",
    },
    USER_ID
  );

async function queuedTypes() {
  const items = await db.syncQueue.toArray();
  items.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return items.map((item) => `${item.entity_type}:${item.operation.op}`);
}

describe("payment and reversal outbox writes", () => {
  beforeEach(async () => {
    await Promise.all([
      db.debts.clear(),
      db.debtPayments.clear(),
      db.events.clear(),
      db.syncQueue.clear(),
    ]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("queues the payment row in server shape", async () => {
    const debt = await newDebt();
    const { payment } = await pay(debt.id, 2500);
    expect(await queuedTypes()).toEqual(["debt_payment:create"]);
    const [item] = await db.syncQueue.toArray();
    expect(item?.operation.payload).not.toHaveProperty("idempotency_key");
    expect(item?.operation.payload).toMatchObject({
      id: payment.id,
      debt_id: debt.id,
      amount_cents: 2500,
    });
  });

  it("queues the status change after the payment that pays a debt off", async () => {
    const debt = await newDebt(2500);
    await pay(debt.id, 2500);
    expect(await queuedTypes()).toEqual(["debt_payment:create", "debt:update"]);
    expect((await db.debts.get(debt.id))?.status).toBe("paid_off");
  });

  it("writes no payment, status or queue item when the transaction throws", async () => {
    const debt = await newDebt(2500);
    vi.spyOn(db.events, "bulkAdd").mockRejectedValueOnce(new Error("boom"));
    await expect(pay(debt.id, 2500)).rejects.toThrow("boom");
    expect(await db.debtPayments.count()).toBe(0);
    expect((await db.debts.get(debt.id))?.status).toBe("active");
    expect(await db.syncQueue.count()).toBe(0);
  });

  it("queues a linked reversal and reactivates a paid-off debt", async () => {
    const debt = await newDebt(2500);
    const { payment } = await pay(debt.id, 2500);
    await db.syncQueue.clear();

    const { reversal } = await reverseDebtPayment(
      { payment_id: payment.id, reason: "test" },
      USER_ID
    );
    expect(reversal.amount_cents).toBe(-2500);
    expect(await queuedTypes()).toEqual(["debt_payment:create", "debt:update"]);
    expect((await db.debts.get(debt.id))?.status).toBe("active");
  });

  it("chains reverse-then-repay against the same working balance", async () => {
    const debt = await newDebt(10000);
    const transactionId = crypto.randomUUID();
    await pay(debt.id, 10000, transactionId); // paid off
    await db.syncQueue.clear();

    await handleTransactionEdit(
      {
        transaction_id: transactionId,
        new_amount_cents: cents(4000),
        new_debt_id: debt.id,
        payment_date: "2026-10-06",
      },
      USER_ID
    );
    // reversal (+10000 back) reactivates, the 4000 re-payment leaves 6000 owed: one net status flip
    expect(await queuedTypes()).toEqual([
      "debt_payment:create",
      "debt:update",
      "debt_payment:create",
    ]);
    expect((await db.debts.get(debt.id))?.status).toBe("active");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/debts/__tests__/payments.outbox.test.ts`
Expected: FAIL (envelope payloads / `Not authenticated` from `getCurrentUserId`).

- [ ] **Step 3: Ledger view**

```ts
// src/lib/debts/ledgerView.ts
import { db } from "@/lib/dexie/db";
import type { Debt, InternalDebt } from "@/types/debt";
import { calculateDebtBalance } from "./balance";
import type { DebtKind } from "./outbox";

/**
 * Working copy of debt rows and balances, so chained prepares (reverse, then
 * re-pay in one edit) see each other's effects before anything is written.
 */
export class DebtLedgerView {
  private readonly debts = new Map<string, Debt | InternalDebt>();
  private readonly balances = new Map<string, number>();

  async debt(kind: DebtKind, id: string): Promise<Debt | InternalDebt | undefined> {
    const cached = this.debts.get(id);
    if (cached) return cached;
    const row = kind === "external" ? await db.debts.get(id) : await db.internalDebts.get(id);
    if (row) this.debts.set(id, row);
    return row;
  }

  async balance(kind: DebtKind, id: string): Promise<number> {
    const cached = this.balances.get(id);
    if (cached !== undefined) return cached;
    const balance = await calculateDebtBalance(id, kind);
    this.balances.set(id, balance);
    return balance;
  }

  setDebt(row: Debt | InternalDebt): void {
    this.debts.set(row.id, row);
  }

  /** Signed ledger: a reversal's negative amount raises the balance. */
  recordPayment(id: string, amountCents: number): void {
    const current = this.balances.get(id);
    if (current === undefined) {
      throw new Error(`Balance for debt ${id} was not loaded before recording a payment`);
    }
    this.balances.set(id, current - amountCents);
  }
}
```

- [ ] **Step 4: Status**

In `status.ts` replace the `./events` import with `import { commitDebtWriteSet, prepareDebtUpdate } from "./outbox";` and add the pure transition above `updateDebtStatusFromBalance`:

```ts
/** The auto transition for this balance, or null when the status stays (archived never moves). */
export function nextDebtStatus<T extends Debt | InternalDebt>(
  debt: T,
  balance: number,
  now: string
): T | null {
  if (debt.status === "archived") return null;
  if (balance <= 0 && debt.status === "active") {
    return { ...debt, status: "paid_off", closed_at: now, updated_at: now };
  }
  if (balance > 0 && debt.status === "paid_off") {
    return { ...debt, status: "active", closed_at: undefined, updated_at: now };
  }
  return null;
}

export async function updateDebtStatusFromBalance(
  debtId: string,
  type: "external" | "internal",
  userId: string,
  precomputedBalance?: number
): Promise<boolean> {
  const balance = precomputedBalance ?? (await calculateDebtBalance(debtId, type));
  const debt =
    type === "external" ? await db.debts.get(debtId) : await db.internalDebts.get(debtId);
  if (!debt) {
    console.warn(`[Status] Debt not found: ${debtId}`);
    return false;
  }

  const updated = nextDebtStatus(debt, balance, new Date().toISOString());
  if (!updated) return false;

  await commitDebtWriteSet(await prepareDebtUpdate(debt, updated, userId));
  console.log(`[Status] ${debt.name}: ${debt.status} → ${updated.status} (balance: ${balance})`);
  return true;
}
```

Add `userId: string` as the last required parameter of `updateMultipleDebtStatuses(debtIds, type, userId)` and `recoverInvalidDebtStates(type, userId)` and pass it to `updateDebtStatusFromBalance(id, type, userId, balance)`.

- [ ] **Step 5: Payments**

Replace `processDebtPayment` in `payments.ts` (remove the `nanoid`, `getNextLamportClock`, `createDebtPaymentEvent` and `updateDebtStatusFromBalance` imports; extend the currency import to `{ ZERO_CENTS, asCents, diffCents }`; import `{ commitDebtWriteSet, emptyWriteSet, mergeWriteSets, prepareDebtUpdate, preparePaymentAdd, type DebtKind, type DebtWriteSet }` from `./outbox`, `{ DebtLedgerView }` from `./ledgerView`, `{ nextDebtStatus }` from `./status`):

```ts
export interface PreparedPayment {
  writeSet: DebtWriteSet;
  result: PaymentResult;
}

/** DEFENSE-IN-DEPTH LAYER 2 for overpayment (UI warns first, the DB trigger recomputes). */
export async function prepareDebtPayment(
  data: ProcessPaymentData,
  userId: string,
  view = new DebtLedgerView()
): Promise<PreparedPayment> {
  if (data.debt_id && data.internal_debt_id) {
    throw new Error("Cannot specify both debt_id and internal_debt_id");
  }
  const debtId = data.debt_id ?? data.internal_debt_id;
  if (!debtId) {
    throw new Error("Must specify either debt_id or internal_debt_id");
  }
  if (data.amount_cents <= 0) {
    throw new Error("Payment amount must be positive");
  }
  const debtType: DebtKind = data.debt_id ? "external" : "internal";

  const debt = await view.debt(debtType, debtId);
  if (!debt) {
    throw new Error("Debt not found");
  }
  if (debt.status === "archived") {
    throw new Error("Cannot make payment to archived debt");
  }

  const currentBalance = await view.balance(debtType, debtId);
  const isOverpayment = currentBalance <= 0 || data.amount_cents > currentBalance;
  const overpaymentAmount = !isOverpayment
    ? ZERO_CENTS
    : currentBalance > 0
      ? diffCents(data.amount_cents, asCents(currentBalance))
      : data.amount_cents;

  const now = new Date().toISOString();
  const payment: DebtPayment = {
    id: crypto.randomUUID(),
    household_id: data.household_id,
    debt_id: data.debt_id,
    internal_debt_id: data.internal_debt_id,
    transaction_id: data.transaction_id,
    amount_cents: data.amount_cents,
    payment_date: data.payment_date,
    device_id: await getDeviceId(),
    is_reversal: false,
    is_overpayment: isOverpayment,
    overpayment_amount: isOverpayment ? overpaymentAmount : undefined,
    created_at: now,
    updated_at: now,
  };
  const paymentWrite = await preparePaymentAdd(payment, userId);

  view.recordPayment(debtId, data.amount_cents);
  const newBalance = currentBalance - data.amount_cents;
  const statusChange = nextDebtStatus(debt, newBalance, now);
  let statusWrite = emptyWriteSet();
  if (statusChange) {
    statusWrite = await prepareDebtUpdate(debt, statusChange, userId);
    view.setDebt(statusChange);
  }

  return {
    writeSet: mergeWriteSets(paymentWrite, statusWrite),
    result: {
      payment,
      wasOverpayment: isOverpayment,
      overpaymentAmount,
      newBalance,
      statusChanged: statusChange !== null,
      newStatus: (statusChange ?? debt).status,
    },
  };
}

export async function processDebtPayment(
  data: ProcessPaymentData,
  userId: string
): Promise<PaymentResult> {
  const { writeSet, result } = await prepareDebtPayment(data, userId);
  await commitDebtWriteSet(writeSet);
  console.log(
    `[Payment Created] ₱${(data.amount_cents / 100).toFixed(2)} for debt ${data.debt_id ?? data.internal_debt_id}`,
    result.wasOverpayment ? "(OVERPAYMENT)" : ""
  );
  return result;
}
```

`calculateDebtBalance` returns `Cents` but the view stores `number`; `asCents(currentBalance)` re-brands for `diffCents` (`src/lib/debts/**` may import `asCents`). If `diffCents` accepts the view's `number` directly, drop the `asCents`.

- [ ] **Step 6: Reversals**

In `reversals.ts` remove the `nanoid`, `getNextLamportClock`, `updateDebtStatusFromBalance`, `processDebtPayment` and `./events` imports; import `{ commitDebtWriteSet, emptyWriteSet, mergeWriteSets, prepareDebtUpdate, preparePaymentAdd, type DebtKind, type DebtWriteSet }` from `./outbox`, `{ DebtLedgerView }` from `./ledgerView`, `{ nextDebtStatus }` from `./status`, `{ prepareDebtPayment }` from `./payments`. Replace the four exported writers (keep the module doc comment, `isPaymentReversed`, `getPaymentReversals`):

```ts
export interface PreparedReversal {
  writeSet: DebtWriteSet;
  result: ReversalResult;
}

export async function prepareReversal(
  data: CreateReversalData,
  userId: string,
  view = new DebtLedgerView()
): Promise<PreparedReversal> {
  const originalPayment = await db.debtPayments.get(data.payment_id);
  if (!originalPayment) {
    throw new Error(`Payment ${data.payment_id} not found`);
  }
  const debtType: DebtKind = originalPayment.debt_id ? "external" : "internal";
  const debtId = originalPayment.debt_id ?? originalPayment.internal_debt_id;
  if (!debtId) {
    throw new Error(`Payment ${data.payment_id} is not linked to a debt`);
  }

  const existingReversal = await db.debtPayments
    .where("reverses_payment_id")
    .equals(data.payment_id)
    .first();
  if (existingReversal) {
    return {
      writeSet: emptyWriteSet(),
      result: {
        reversal: existingReversal,
        originalPayment,
        newBalance: await view.balance(debtType, debtId),
        statusChanged: false,
        newStatus: undefined,
      },
    };
  }

  const debt = await view.debt(debtType, debtId);
  if (debt?.status === "archived") {
    console.warn(`Reversing payment on archived debt ${debtId}. Status will change to active.`);
  }

  const now = new Date().toISOString();
  // Always the exact negation of its target, linked at any cascade depth
  const reversal: DebtPayment = {
    id: crypto.randomUUID(),
    household_id: originalPayment.household_id,
    debt_id: originalPayment.debt_id,
    internal_debt_id: originalPayment.internal_debt_id,
    transaction_id: originalPayment.transaction_id,
    amount_cents: negateCents(originalPayment.amount_cents),
    payment_date: format(new Date(), "yyyy-MM-dd"),
    is_reversal: true,
    reverses_payment_id: data.payment_id,
    adjustment_reason: data.reason,
    is_overpayment: false,
    overpayment_amount: undefined,
    device_id: await getDeviceId(),
    created_at: now,
    updated_at: now,
  };
  const reversalWrite = await preparePaymentAdd(reversal, userId);

  const balanceBefore = await view.balance(debtType, debtId);
  view.recordPayment(debtId, reversal.amount_cents);
  const newBalance = balanceBefore - reversal.amount_cents;

  let statusChange: Debt | InternalDebt | null = null;
  if (debt) {
    statusChange =
      debt.status === "archived"
        ? newBalance > 0
          ? { ...debt, status: "active", closed_at: undefined, updated_at: now }
          : null
        : nextDebtStatus(debt, newBalance, now);
  }
  let statusWrite = emptyWriteSet();
  if (debt && statusChange) {
    statusWrite = await prepareDebtUpdate(debt, statusChange, userId);
    view.setDebt(statusChange);
  }

  return {
    writeSet: mergeWriteSets(reversalWrite, statusWrite),
    result: {
      reversal,
      originalPayment,
      newBalance,
      statusChanged: statusChange !== null,
      newStatus: (statusChange ?? debt)?.status,
    },
  };
}

export async function reverseDebtPayment(
  data: CreateReversalData,
  userId: string
): Promise<ReversalResult> {
  const { writeSet, result } = await prepareReversal(data, userId);
  await commitDebtWriteSet(writeSet);
  return result;
}

type TransactionDebtOperation = {
  type: "reversal" | "payment";
  record: DebtPayment;
  debtId: string;
  debtType: DebtKind;
};

export interface PreparedTransactionEdit {
  writeSet: DebtWriteSet;
  operations: TransactionDebtOperation[];
  reversalCreated: boolean;
  paymentCreated: boolean;
}

/** Edit as reverse-and-create: reverse the live payment, then pay the new amount/debt. */
export async function prepareTransactionEdit(
  data: TransactionEditData,
  userId: string
): Promise<PreparedTransactionEdit> {
  const view = new DebtLedgerView();
  const operations: TransactionDebtOperation[] = [];
  const writeSets: DebtWriteSet[] = [];

  const rows = await db.debtPayments.where("transaction_id").equals(data.transaction_id).toArray();
  const reversedIds = new Set(
    rows.flatMap((p) => (p.reverses_payment_id ? [p.reverses_payment_id] : []))
  );
  const regular = rows.filter((p) => !p.is_reversal);
  regular.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const existingPayment = regular.find((p) => !reversedIds.has(p.id)) ?? regular[0];

  if (existingPayment) {
    const { writeSet, result } = await prepareReversal(
      { payment_id: existingPayment.id, reason: "transaction_edited" },
      userId,
      view
    );
    writeSets.push(writeSet);
    const oldDebtId = existingPayment.debt_id ?? existingPayment.internal_debt_id;
    if (oldDebtId) {
      operations.push({
        type: "reversal",
        record: result.reversal,
        debtId: oldDebtId,
        debtType: existingPayment.debt_id ? "external" : "internal",
      });
    }
  }

  const newDebtId = data.new_debt_id ?? data.new_internal_debt_id;
  const newAmount = data.new_amount_cents;
  if (newDebtId && newAmount && newAmount > 0) {
    const newDebtType: DebtKind = data.new_debt_id ? "external" : "internal";
    const debt = await view.debt(newDebtType, newDebtId);
    if (!debt) {
      throw new Error(`Debt ${newDebtId} not found`);
    }
    const { writeSet, result } = await prepareDebtPayment(
      {
        transaction_id: data.transaction_id,
        amount_cents: newAmount,
        payment_date: data.payment_date,
        debt_id: newDebtType === "external" ? newDebtId : undefined,
        internal_debt_id: newDebtType === "internal" ? newDebtId : undefined,
        household_id: debt.household_id,
      },
      userId,
      view
    );
    writeSets.push(writeSet);
    operations.push({
      type: "payment",
      record: result.payment,
      debtId: newDebtId,
      debtType: newDebtType,
    });
  }

  return {
    writeSet: mergeWriteSets(...writeSets),
    operations,
    reversalCreated: operations.some((op) => op.type === "reversal"),
    paymentCreated: operations.some((op) => op.type === "payment"),
  };
}

export async function handleTransactionEdit(data: TransactionEditData, userId: string) {
  const { writeSet, ...outcome } = await prepareTransactionEdit(data, userId);
  await commitDebtWriteSet(writeSet);
  return outcome;
}

/** Reverses every live payment of a deleted transaction (normally exactly one). */
export async function prepareTransactionDelete(
  data: TransactionDeleteData,
  userId: string
): Promise<{ writeSet: DebtWriteSet; result: ReversalResult | undefined }> {
  const rows = await db.debtPayments.where("transaction_id").equals(data.transaction_id).toArray();
  const reversedIds = new Set(
    rows.flatMap((p) => (p.reverses_payment_id ? [p.reverses_payment_id] : []))
  );
  const livePayments = rows.filter((p) => !p.is_reversal && !reversedIds.has(p.id));

  const view = new DebtLedgerView();
  const writeSets: DebtWriteSet[] = [];
  let result: ReversalResult | undefined;
  for (const payment of livePayments) {
    const prepared = await prepareReversal(
      { payment_id: payment.id, reason: "transaction_deleted" },
      userId,
      view
    );
    writeSets.push(prepared.writeSet);
    result = prepared.result;
  }
  return { writeSet: mergeWriteSets(...writeSets), result };
}

export async function handleTransactionDelete(
  data: TransactionDeleteData,
  userId: string
): Promise<ReversalResult | undefined> {
  const { writeSet, result } = await prepareTransactionDelete(data, userId);
  await commitDebtWriteSet(writeSet);
  return result;
}
```

The "most recent regular payment" fallback in `prepareTransactionEdit` keeps today's behavior when every regular row is already reversed (the old code sorted the same way). Add `Debt` and `InternalDebt` to the `@/types/debt` type import.

In `index.ts` add `prepareDebtPayment` to the payments export, `prepareReversal`, `prepareTransactionEdit`, `prepareTransactionDelete` to the reversals export, `nextDebtStatus` to the status export.

- [ ] **Step 7: Callers**

`src/lib/offline/transactions.ts`: pass `userId` as the second argument to `processDebtPayment`, `handleTransactionEdit` and `handleTransactionDelete` (Task 7 replaces these calls).

`src/lib/delete-transaction.ts`: the offline delete already reverses linked payments, so the UI must not do it first (two separate commits). Replace the import with `import { isTransactionLinkedToDebt } from "@/lib/debts";` and the `try` body with:

```ts
const wasDebtLinked = await isTransactionLinkedToDebt(id);
await deleteTransaction(id);

if (wasDebtLinked) {
  queryClient.invalidateQueries({ queryKey: ["debts"] });
  queryClient.invalidateQueries({ queryKey: ["debt-balance"] });
  toast.success("Transaction deleted and debt balance restored");
} else {
  toast.success("Transaction deleted");
}
return true;
```

`src/components/TransactionList.tsx`: delete the `handleTransactionDelete` import and, in the bulk delete, the `await handleTransactionDelete({ transaction_id: id });` line with its comment (the map callback becomes `async (id) => { await deleteTransaction.mutateAsync(id); }`).

Test mocks: in `src/components/TransactionList.test.tsx` and `src/__tests__/transactions-route.test.tsx` change the `@/lib/debts` mock to `isTransactionLinkedToDebt: vi.fn().mockResolvedValue(false)`; in `transactions-route.test.tsx` import `isTransactionLinkedToDebt` instead of `handleTransactionDelete`, replace the assertion with `expect(vi.mocked(isTransactionLinkedToDebt)).toHaveBeenCalledWith("txn-1");`, and update the comment above it to "confirm → delete mutation (debt reversal happens inside the offline delete)".

`src/lib/offline/transactions.test.ts`: the `handleTransactionEdit` assertion becomes `toHaveBeenCalledWith(expect.objectContaining({ transaction_id: tx.id, new_debt_id: "debt-1" }), testUserId)`.

- [ ] **Step 8: Existing debt suites**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "__tests__/(payments|reversals|status)\.test"`
Expected: TS2554 at each changed call. Add a trailing `"test-user-id"` argument to every listed `processDebtPayment`, `reverseDebtPayment`, `handleTransactionEdit`, `handleTransactionDelete`, `updateDebtStatusFromBalance` (insert before `precomputedBalance` where one is passed), `updateMultipleDebtStatuses`, `recoverInvalidDebtStates` call until the grep prints nothing. Tests that read `payment.idempotency_key` now get `undefined`; assert on the queue item's `operation.idempotencyKey` instead.

- [ ] **Step 9: Verify**

```bash
npx vitest run src/lib/debts src/lib/offline src/components/TransactionList.test.tsx src/__tests__/transactions-route.test.tsx
npx tsc --noEmit -p tsconfig.json; echo "exit $?"
npx tsc --noEmit -p tsconfig.strict.json; echo "exit $?"
npm run lint
```

Expected: all PASS, both tsc exit 0, lint 0 errors.

- [ ] **Step 10: Commit**

```bash
git add src/lib/debts src/lib/offline/transactions.ts src/lib/offline/transactions.test.ts src/lib/delete-transaction.ts src/components/TransactionList.tsx src/components/TransactionList.test.tsx src/__tests__/transactions-route.test.tsx
git commit -m "fix(debts): atomic payment, reversal and status writes"
```

---

### Task 7: Atomic transaction + debt writes

**Files:**

- Modify: `src/lib/offline/transactions.ts` (`createOfflineTransaction`, `updateOfflineTransaction`, `deleteOfflineTransaction`)
- Modify: `src/lib/offline/transactions.test.ts` (mock factory)
- Test: `src/lib/offline/transactions.debts.test.ts`

**Interfaces:**

- Consumes: `prepareDebtPayment`, `prepareTransactionEdit`, `prepareTransactionDelete` (`@/lib/debts`); `emptyWriteSet`, `applyDebtWriteSet`, `debtWriteTables` (`@/lib/debts/outbox`)

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/offline/transactions.debts.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/dexie/db";
import { createExternalDebt } from "@/lib/debts/crud";
import { DEFAULT_HOUSEHOLD_ID } from "@/lib/household";
import {
  createOfflineTransaction,
  deleteOfflineTransaction,
  updateOfflineTransaction,
} from "./transactions";
import { cents } from "@/test/cents";

vi.mock("@/lib/supabase", () => {
  const supabase = {
    from: vi.fn(),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
  };
  return { supabase, untypedSupabase: supabase };
});

const USER_ID = "12345678-1234-5678-1234-567812345678";

async function queuedTypes() {
  const items = await db.syncQueue.toArray();
  items.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return items.map((item) => `${item.entity_type}:${item.operation.op}`);
}

async function linkedTransaction(debtId: string) {
  const result = await createOfflineTransaction(
    {
      date: "2026-10-06",
      description: "Loan payment",
      amount_cents: cents(2500),
      type: "expense",
      status: "cleared",
      visibility: "household",
      debt_id: debtId,
    },
    USER_ID
  );
  if (!result.success || !result.data) throw new Error(result.error);
  return result.data;
}

describe("transaction writes with a debt link", () => {
  let debtId = "";

  beforeEach(async () => {
    await Promise.all([
      db.transactions.clear(),
      db.debts.clear(),
      db.debtPayments.clear(),
      db.events.clear(),
      db.syncQueue.clear(),
    ]);
    const debt = await createExternalDebt(
      { name: "Loan", original_amount_cents: cents(10000), household_id: DEFAULT_HOUSEHOLD_ID },
      USER_ID
    );
    debtId = debt.id;
    await db.syncQueue.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("queues the transaction before its payment", async () => {
    await linkedTransaction(debtId);
    expect(await queuedTypes()).toEqual(["transaction:create", "debt_payment:create"]);
  });

  it("writes nothing when the debt payment cannot be prepared", async () => {
    const result = await createOfflineTransaction(
      {
        date: "2026-10-06",
        description: "x",
        amount_cents: cents(100),
        type: "expense",
        status: "cleared",
        visibility: "household",
        debt_id: crypto.randomUUID(),
      },
      USER_ID
    );
    expect(result.success).toBe(false);
    expect(await db.transactions.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it("writes nothing when the combined transaction throws", async () => {
    vi.spyOn(db.debtPayments, "bulkAdd").mockRejectedValueOnce(new Error("boom"));
    const result = await createOfflineTransaction(
      {
        date: "2026-10-06",
        description: "x",
        amount_cents: cents(100),
        type: "expense",
        status: "cleared",
        visibility: "household",
        debt_id: debtId,
      },
      USER_ID
    );
    expect(result.success).toBe(false);
    expect(await db.transactions.count()).toBe(0);
    expect(await db.debtPayments.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it("reverses the payment when the debt link is removed", async () => {
    const tx = await linkedTransaction(debtId);
    await db.syncQueue.clear();
    const result = await updateOfflineTransaction(tx.id, { debt_id: null }, USER_ID);
    expect(result.success).toBe(true);
    expect(await queuedTypes()).toEqual(["transaction:update", "debt_payment:create"]);
    const reversal = (await db.debtPayments.toArray()).find((p) => p.is_reversal);
    expect(reversal?.amount_cents).toBe(-2500);
  });

  it("queues the reversal before the transaction delete", async () => {
    const tx = await linkedTransaction(debtId);
    await db.syncQueue.clear();
    const result = await deleteOfflineTransaction(tx.id, USER_ID);
    expect(result.success).toBe(true);
    expect(await queuedTypes()).toEqual(["debt_payment:create", "transaction:delete"]);
    expect(await db.transactions.get(tx.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/offline/transactions.debts.test.ts`
Expected: "writes nothing when the combined transaction throws" FAILS (the transaction row survives: the payment is a second commit), and "reverses the payment when the debt link is removed" FAILS (no reversal: the old guard checks only the updated row's link).

- [ ] **Step 3: Implement**

Imports in `transactions.ts`: replace the `@/lib/debts` import with

```ts
import { prepareDebtPayment, prepareTransactionDelete, prepareTransactionEdit } from "@/lib/debts";
import { applyDebtWriteSet, debtWriteTables, emptyWriteSet } from "@/lib/debts/outbox";
```

`createOfflineTransaction`: replace everything from the `db.transaction` call through the end of the `if (input.debt_id || input.internal_debt_id)` block with

```ts
// Prepared after the transaction item so its queue items sort after it:
// debt_payments.transaction_id references transactions
let debtWrite = emptyWriteSet();
if (input.debt_id || input.internal_debt_id) {
  try {
    const prepared = await prepareDebtPayment(
      {
        transaction_id: id,
        amount_cents: input.amount_cents,
        payment_date: input.date,
        debt_id: input.debt_id ?? undefined,
        internal_debt_id: input.internal_debt_id ?? undefined,
        household_id: DEFAULT_HOUSEHOLD_ID,
      },
      userId
    );
    debtWrite = prepared.writeSet;
  } catch (error) {
    console.error("Failed to create debt payment:", error);
    return {
      success: false,
      error: `Failed to create debt payment: ${error instanceof Error ? error.message : "Unknown error"}`,
      isTemporary: false,
    };
  }
}

// Transaction, payment, status change and their outbox items commit together
await db.transaction("rw", [db.transactions, ...debtWriteTables()], async () => {
  await db.transactions.add(transaction);
  await db.syncQueue.add(queueItem);
  await applyDebtWriteSet(debtWrite);
});
```

`updateOfflineTransaction`: replace the `db.transaction` call and the trailing `debtFieldsChanged` block with

```ts
const debtFieldsChanged =
  updates.amount_cents !== undefined ||
  updates.debt_id !== undefined ||
  updates.internal_debt_id !== undefined ||
  updates.date !== undefined;
// The old link counts too: unlinking must reverse the live payment
const touchesDebt = Boolean(
  updated.debt_id || updated.internal_debt_id || existing.debt_id || existing.internal_debt_id
);

let debtWrite = emptyWriteSet();
if (debtFieldsChanged && touchesDebt) {
  try {
    const prepared = await prepareTransactionEdit(
      {
        transaction_id: id,
        new_amount_cents: updated.amount_cents,
        new_debt_id: updated.debt_id,
        new_internal_debt_id: updated.internal_debt_id,
        payment_date: updated.date,
      },
      userId
    );
    debtWrite = prepared.writeSet;
  } catch (error) {
    console.error("Failed to adjust debt payment:", error);
    return {
      success: false,
      error: `Failed to adjust debt payment: ${error instanceof Error ? error.message : "Unknown error"}`,
      isTemporary: false,
    };
  }
}

await db.transaction("rw", [db.transactions, ...debtWriteTables()], async () => {
  await db.transactions.put(updated);
  await db.syncQueue.add(queueItem);
  await applyDebtWriteSet(debtWrite);
});
```

`deleteOfflineTransaction`: replace the reversal `try`/`catch`, the `queueItem` line and the `db.transaction` call with

```ts
let debtWrite = emptyWriteSet();
try {
  debtWrite = (await prepareTransactionDelete({ transaction_id: id }, userId)).writeSet;
} catch (error) {
  console.error("Failed to reverse debt payment:", error);
  return {
    success: false,
    error: `Failed to reverse debt payment: ${error instanceof Error ? error.message : "Unknown error"}`,
    isTemporary: false,
  };
}

// Built after the reversal items: reversal rows reference this transaction
const queueItem = await buildSyncQueueItem("transaction", id, "delete", { id }, userId);

await db.transaction("rw", [db.transactions, ...debtWriteTables()], async () => {
  await applyDebtWriteSet(debtWrite);
  await db.transactions.delete(id);
  await db.syncQueue.add(queueItem);
});
```

Update the module and function doc comments that describe the old compensation ("cannot join the transaction above") to say the debt writes commit in the same transaction.

- [ ] **Step 4: Update the mocked suite**

In `src/lib/offline/transactions.test.ts` replace the `@/lib/debts` mock with

```ts
vi.mock("@/lib/debts", async () => {
  const { emptyWriteSet } = await import("@/lib/debts/outbox");
  return {
    prepareDebtPayment: vi.fn().mockResolvedValue({ writeSet: emptyWriteSet() }),
    prepareTransactionEdit: vi.fn().mockResolvedValue({ writeSet: emptyWriteSet() }),
    prepareTransactionDelete: vi.fn().mockResolvedValue({ writeSet: emptyWriteSet() }),
  };
});
```

change the `handleTransactionEdit` import to `prepareTransactionEdit`, and the assertion to `expect(vi.mocked(prepareTransactionEdit)).toHaveBeenCalledWith(expect.objectContaining({ transaction_id: tx.id, new_debt_id: "debt-1" }), testUserId);`.

- [ ] **Step 5: Verify**

```bash
npx vitest run src/lib/offline
npx tsc --noEmit -p tsconfig.strict.json; echo "exit $?"
```

Expected: all PASS; strict exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/offline/transactions.ts src/lib/offline/transactions.test.ts src/lib/offline/transactions.debts.test.ts
git commit -m "fix(offline): commit transaction and debt writes together"
```

---

### Task 8: Remove the envelope path; ban nanoid

**Files:**

- Modify: `src/lib/debts/events.ts` (delete `createDebtEvent`, `createInternalDebtEvent`, `createDebtPaymentEvent`, their imports of `nanoid`, `getDeviceId`, `getNextLamportClock`, `./sync`; keep `calculateDelta`, `eventExists`, `getDebtEvents`, `getPaymentEvents`, `getDebtEventsInRange`; rewrite the module comment's "Event Structure" and "Key Patterns" to: events are a local audit log written by `outbox.ts` with the queue item's clock and idempotency key, never synced)
- Modify: `src/lib/debts/sync.ts` (delete `getCurrentUserId`, `addDebtEventToSyncQueue`, the `supabase` and `addToSyncQueue` imports; update the module comment's integration pattern to "`outbox.ts` writes queue items; this module reads queue status")
- Modify: `src/lib/debts/index.ts` (drop the three `create*Event` exports and `addDebtEventToSyncQueue`)
- Modify: `src/lib/debts/__tests__/{crud,payments,reversals,status}.test.ts` (delete each `vi.mock("../sync", ...)` block and its comment), `src/lib/debts/__tests__/test-utils.ts` (`nanoid()` → `crypto.randomUUID()`, drop the import)
- Modify: `eslint.config.js`
- Test: `src/lib/__tests__/architecture-lint.test.ts`

- [ ] **Step 1: Write the failing lint test**

Append a case to the `cases` array in `src/lib/__tests__/architecture-lint.test.ts` (the `describe.each` below it checks fires / silent / silent-in-tests):

```ts
  {
    rule: "no-restricted-imports",
    code: 'import { nanoid } from "nanoid";\nexport const id = nanoid();\n',
    flagged: "src/lib/debts/probe.ts",
    allowed: "src/lib/import-drafts.ts",
  },
```

Also add one standalone case for the offline directory:

```ts
it("no-restricted-imports bans nanoid in src/lib/offline", async () => {
  const code = 'import { nanoid } from "nanoid";\nexport const id = nanoid();\n';
  expect(await ruleIds(code, "src/lib/offline/probe.ts")).toContain("no-restricted-imports");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/__tests__/architecture-lint.test.ts -t nanoid`
Expected: the "bans" case FAILS.

- [ ] **Step 3: Add the rule** (append as the last entry before `prettier` in `eslint.config.js`)

```js
  {
    // Server ids are uuid columns; a nanoid id can never sync (debt sync defects, 2026-10-06).
    // These directories sit in asCentsAllowed today. If 2c narrows that list, this block must
    // also carry restrictAsCents: a later block's no-restricted-imports replaces earlier ones.
    files: ["src/lib/debts/**/*.ts", "src/lib/offline/**/*.ts"],
    ignores: srcTestFiles,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "nanoid",
              message: "Use crypto.randomUUID(): local ids are server ids and the columns are uuid.",
            },
          ],
        },
      ],
    },
  },
```

- [ ] **Step 4: Delete the envelope code and test mocks** (as listed under Files)

- [ ] **Step 5: Verify**

```bash
grep -rn "createDebtEvent\|createInternalDebtEvent\|createDebtPaymentEvent\|addDebtEventToSyncQueue\|getCurrentUserId" src
grep -rln "from \"nanoid\"" src
npx vitest run src/lib/debts src/lib/__tests__/architecture-lint.test.ts
npm run lint
npx tsc --noEmit -p tsconfig.json; echo "exit $?"
```

Expected: first grep prints nothing; second prints only `src/lib/import-drafts.ts`, `src/lib/event-compactor.ts`, `src/lib/event-compactor.test.ts`; tests PASS; lint 0 errors; tsc exit 0. The `[Debt Sync] ... Not authenticated` stderr noted in the roadmap's test hygiene bullet should be gone from `npx vitest run src/lib/debts`.

- [ ] **Step 6: Commit**

```bash
git add eslint.config.js src/lib/debts src/lib/__tests__/architecture-lint.test.ts
git commit -m "refactor(debts): drop the event-envelope queue path, ban nanoid ids"
```

---

### Task 9: Pull schemas for debt tables

**Files:**

- Modify: `src/lib/validations/syncRows.ts`
- Test: `src/lib/validations/syncRows.test.ts` (new)

**Interfaces:**

- Produces: `SyncTableName = "transactions" | "accounts" | "categories" | "debts" | "internal_debts" | "debt_payments"`; `debtRowSchema`, `internalDebtRowSchema`, `debtPaymentRowSchema`; `parseSyncRow` handles all six.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/validations/syncRows.test.ts
import { describe, expect, it } from "vitest";
import { parseSyncRow } from "./syncRows";

const serverDebt = {
  id: "8b5f8e0e-1111-4e5a-9a4e-000000000001",
  household_id: "h1",
  name: "Loan",
  original_amount_cents: 10000,
  status: "active",
  closed_at: null,
  created_at: "2026-10-06T00:00:00Z",
  updated_at: "2026-10-06T00:00:00Z",
};

const serverReversal = {
  id: "8b5f8e0e-1111-4e5a-9a4e-000000000002",
  household_id: "h1",
  debt_id: serverDebt.id,
  internal_debt_id: null,
  transaction_id: "8b5f8e0e-1111-4e5a-9a4e-000000000003",
  amount_cents: -2500,
  payment_date: "2026-10-06",
  device_id: "other-device",
  is_reversal: true,
  reverses_payment_id: "8b5f8e0e-1111-4e5a-9a4e-000000000004",
  adjustment_reason: null,
  is_overpayment: null,
  overpayment_amount: null,
  created_at: "2026-10-06T01:00:00Z",
};

describe("parseSyncRow for debt tables", () => {
  it("parses a debt and drops a null closed_at", () => {
    const parsed = parseSyncRow("debts", serverDebt);
    expect(parsed.ok && parsed.row).toMatchObject({
      original_amount_cents: 10000,
      closed_at: undefined,
    });
  });

  it("parses an internal debt", () => {
    const parsed = parseSyncRow("internal_debts", {
      ...serverDebt,
      from_type: "account",
      from_id: "a1",
      from_display_name: "Cash",
      to_type: "member",
      to_id: "u1",
      to_display_name: "Ana",
    });
    expect(parsed.ok).toBe(true);
  });

  it("parses a negative reversal row and derives updated_at from created_at", () => {
    const parsed = parseSyncRow("debt_payments", serverReversal);
    expect(parsed.ok && parsed.row).toMatchObject({
      amount_cents: -2500,
      is_overpayment: false,
      updated_at: serverReversal.created_at,
      debt_id: serverDebt.id,
      internal_debt_id: undefined,
    });
  });

  it("rejects an unknown debt status and fractional cents", () => {
    expect(parseSyncRow("debts", { ...serverDebt, status: "closed" }).ok).toBe(false);
    expect(parseSyncRow("debt_payments", { ...serverReversal, amount_cents: 12.5 }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/validations/syncRows.test.ts`
Expected: FAIL (TS/runtime: `"debts"` is not a `SyncTableName`; `schemas[table]` is undefined).

- [ ] **Step 3: Implement** (in `syncRows.ts`)

```ts
import type { Debt, DebtPayment, InternalDebt } from "@/types/debt";

export type SyncTableName =
  | "transactions"
  | "accounts"
  | "categories"
  | "debts"
  | "internal_debts"
  | "debt_payments";

const debtStatus = z.enum(["active", "paid_off", "archived"]);
const debtEntityType = z.enum(["category", "account", "member"]);
const flag = z
  .boolean()
  .nullish()
  .transform((value) => value ?? false);

export const debtRowSchema = z.object({
  id: z.string(),
  household_id: z.string(),
  name: z.string(),
  original_amount_cents: centsValue,
  status: debtStatus,
  closed_at: optionalText,
  created_at: timestamp,
  updated_at: timestamp,
}) satisfies z.ZodType<Debt, z.ZodTypeDef, unknown>;

export const internalDebtRowSchema = debtRowSchema.extend({
  from_type: debtEntityType,
  from_id: z.string(),
  from_display_name: z.string(),
  to_type: debtEntityType,
  to_id: z.string(),
  to_display_name: z.string(),
}) satisfies z.ZodType<InternalDebt, z.ZodTypeDef, unknown>;

/** The server ledger is append-only (no updated_at); locally a row's updated_at is its created_at. */
export const debtPaymentRowSchema = z
  .object({
    id: z.string(),
    household_id: z.string(),
    debt_id: optionalText,
    internal_debt_id: optionalText,
    transaction_id: z.string(),
    amount_cents: centsValue,
    payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    device_id: z.string(),
    is_reversal: flag,
    reverses_payment_id: optionalText,
    adjustment_reason: optionalText,
    is_overpayment: flag,
    overpayment_amount: centsValue.nullish().transform((value) => value ?? undefined),
    created_at: timestamp,
  })
  .transform((row) => ({ ...row, updated_at: row.created_at })) satisfies z.ZodType<
  DebtPayment,
  z.ZodTypeDef,
  unknown
>;
```

Extend `SyncRowResult`'s row union with `Debt | InternalDebt | DebtPayment`, and the `schemas` map with `debts: debtRowSchema, internal_debts: internalDebtRowSchema, debt_payments: debtPaymentRowSchema`.

The wider `SyncTableName` makes `getTable` in `src/lib/realtime-sync.ts` non-exhaustive (TS2366), so add its three cases in this task (nothing subscribes to them until Task 10):

```ts
    case "debts":
      return db.debts as unknown as AnyTable;
    case "internal_debts":
      return db.internalDebts as unknown as AnyTable;
    case "debt_payments":
      return db.debtPayments as unknown as AnyTable;
```

and widen its `SyncRecord` union: `type SyncRecord = LocalTransaction | LocalAccount | LocalCategory | Debt | InternalDebt | DebtPayment;` with `import type { Debt, DebtPayment, InternalDebt } from "@/types/debt";`.

- [ ] **Step 4: Verify**

```bash
npx vitest run src/lib/validations/syncRows.test.ts src/lib/__tests__/realtime-sync.test.ts
npx tsc --noEmit -p tsconfig.json; echo "exit $?"
```

Expected: PASS; tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/syncRows.ts src/lib/validations/syncRows.test.ts src/lib/realtime-sync.ts
git commit -m "feat(sync): validate debt rows from the server"
```

---

### Task 10: Realtime and catch-up for debt tables

**Files:**

- Modify: `src/lib/realtime-sync.ts`
- Test: `src/lib/__tests__/realtime-sync.test.ts`

**Interfaces:**

- Consumes: Task 9 `SyncTableName`, `parseSyncRow`
- Produces: module constants `SYNC_TABLES` (FK order), `INSERT_ONLY_TABLES`, `cursorColumn(table)`

- [ ] **Step 1: Write the failing tests**

Change the `@/lib/supabase` mock so `gte` records its column and both client exports exist:

```ts
const gteColumns = new Map<string, string>();

vi.mock("@/lib/supabase", () => {
  const client = {
    channel: (name: string) => {
      const channel = {
        on: (_event: string, _filter: unknown, handler: ChangeHandler) => {
          handlers.set(name.replace("-changes", ""), handler);
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: vi.fn(),
    from: (table: string) => {
      const query = {
        select: () => query,
        gte: (column: string) => {
          gteColumns.set(table, column);
          return query;
        },
        order: () => Promise.resolve({ data: catchUpRows.get(table) ?? [], error: null }),
      };
      return query;
    },
  };
  return { supabase: client, untypedSupabase: client };
});
```

Add `gteColumns.clear()`, `await db.debts.clear()`, `await db.internalDebts.clear()`, `await db.debtPayments.clear()` to `beforeEach`, then:

```ts
const serverDebt = {
  id: "d-remote",
  household_id: "h1",
  name: "Loan",
  original_amount_cents: 10000,
  status: "active",
  closed_at: null,
  created_at: "2026-10-04T01:00:00Z",
  updated_at: "2026-10-04T01:00:00Z",
};
const serverPayment = {
  id: "p-remote",
  household_id: "h1",
  debt_id: "d-remote",
  internal_debt_id: null,
  transaction_id: "t-remote",
  amount_cents: 2500,
  payment_date: "2026-10-04",
  device_id: "other-device",
  is_reversal: false,
  reverses_payment_id: null,
  adjustment_reason: null,
  is_overpayment: false,
  overpayment_amount: null,
  created_at: "2026-10-04T03:00:00Z",
};

describe("RealtimeSync debt tables", () => {
  it("subscribes to all six tables", async () => {
    expect([...handlers.keys()].sort()).toEqual([
      "accounts",
      "categories",
      "debt_payments",
      "debts",
      "internal_debts",
      "transactions",
    ]);
  });

  it("inserts a debt from realtime", async () => {
    await handlers.get("debts")?.({ eventType: "INSERT", new: serverDebt, old: {} });
    expect(await db.debts.get("d-remote")).toMatchObject({ original_amount_cents: 10000 });
  });

  it("treats payments as append-only", async () => {
    await handlers.get("debt_payments")?.({ eventType: "INSERT", new: serverPayment, old: {} });
    await handlers.get("debt_payments")?.({
      eventType: "UPDATE",
      new: { ...serverPayment, amount_cents: 9999 },
      old: {},
    });
    await handlers.get("debt_payments")?.({ eventType: "DELETE", new: {}, old: serverPayment });
    expect(await db.debtPayments.get("p-remote")).toMatchObject({ amount_cents: 2500 });
  });

  it("catches up debts on updated_at and payments on created_at", async () => {
    catchUpRows.set("debts", [serverDebt]);
    catchUpRows.set("debt_payments", [serverPayment]);

    await new RealtimeSync().handleReconnection();

    expect(gteColumns.get("debts")).toBe("updated_at");
    expect(gteColumns.get("debt_payments")).toBe("created_at");
    expect(await db.debts.get("d-remote")).toBeDefined();
    expect(await db.debtPayments.get("p-remote")).toBeDefined();
    expect((await db.meta.get("syncHighWaterMark"))?.value).toBe("2026-10-04T03:00:00Z");
  });

  it("skips and reports an invalid payment row", async () => {
    catchUpRows.set("debt_payments", [{ ...serverPayment, amount_cents: 1.5 }]);
    await new RealtimeSync().handleReconnection();
    expect(await db.debtPayments.get("p-remote")).toBeUndefined();
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ operation: "invalid-row:debt_payments" })
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/__tests__/realtime-sync.test.ts`
Expected: the new cases FAIL (no debt handlers; catch-up skips the debt tables).

- [ ] **Step 3: Implement** (in `realtime-sync.ts`)

Table constants (`getTable` and `SyncRecord` already cover the debt tables from Task 9):

```ts
/** Catch-up order: parents before the rows that reference them. */
const SYNC_TABLES: SyncTableName[] = [
  "accounts",
  "categories",
  "debts",
  "internal_debts",
  "transactions",
  "debt_payments",
];

/** Ledger rows are immutable; a reversal is a new row. */
const INSERT_ONLY_TABLES: ReadonlySet<SyncTableName> = new Set(["debt_payments"]);

/** debt_payments has no updated_at; both columns are server timestamps, so one high-water mark serves all tables. */
function cursorColumn(tableName: SyncTableName): "updated_at" | "created_at" {
  return INSERT_ONLY_TABLES.has(tableName) ? "created_at" : "updated_at";
}
```

`initialize`: `await Promise.all(SYNC_TABLES.map((table) => this.subscribeToTable(table)));` (delete the local `tables` array and its "budgets will be added" comment).

`handleTableChange` switch:

```ts
        case "UPDATE":
          if (INSERT_ONLY_TABLES.has(tableName)) {
            await this.handleInsert(tableName, newRecord);
          } else {
            await this.handleUpdate(tableName, newRecord, oldRecord);
          }
          break;
        case "DELETE":
          if (INSERT_ONLY_TABLES.has(tableName)) {
            console.warn(`[RealtimeSync] Ignored DELETE on append-only ${tableName}`);
          } else {
            await this.handleDelete(tableName, oldRecord);
          }
          break;
```

`fetchLatestChanges`: loop over `SYNC_TABLES`; inside the loop

```ts
const column = cursorColumn(tableName);
const { data, error } = await supabase
  .from(tableName)
  .select("*")
  .gte(column, since.toISOString())
  .order(column, { ascending: true });
```

and track `const seenAt = record[column] as string; if (seenAt > maxSeen) maxSeen = seenAt;` in place of the `updatedAt` lines. Update the doc comment ("records updated since" → "records changed since, on each table's cursor column").

If `supabase.from(tableName)` over the six-name union produces a TS error on `.gte(column, ...)`, use `untypedSupabase` for this one query (rows are validated by `parseSyncRow` either way) and note it in the commit body.

`mergeRecord`: after the `if (!local) { ... }` branch add

```ts
    } else if (INSERT_ONLY_TABLES.has(tableName)) {
      return;
    } else {
```

(keep the existing timestamp comparison in the final branch).

`isHealthy`: `const expectedTables = SYNC_TABLES.length;` (delete the "budgets in future chunk" comment). Update the module header's table list.

- [ ] **Step 4: Verify**

```bash
npx vitest run src/lib/__tests__/realtime-sync.test.ts src/lib/validations
npx tsc --noEmit -p tsconfig.json; echo "exit $?"
npm run lint
```

Expected: all PASS (including the four pre-existing cases), tsc exit 0, lint 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/realtime-sync.ts src/lib/__tests__/realtime-sync.test.ts
git commit -m "feat(sync): pull debts, internal debts and payments"
```

---

### Task 11: Legacy id repair

**Files:**

- Create: `src/lib/debts/repair.ts`
- Modify: `src/routes/__root.tsx` (auto-sync effect)
- Test: `src/lib/debts/__tests__/repair.test.ts`

**Interfaces:**

- Consumes: `buildSyncQueueItem`, `toDebtInsert`, `toInternalDebtInsert`, `toDebtPaymentInsert`
- Produces: `repairLegacyDebtIds(userId: string): Promise<DebtIdRepairResult>`; `DEBT_ID_REPAIR_KEY = "debtIdRepair"`; `interface DebtIdRepairResult { ran: boolean; rekeyed: number; queued: number; rewrittenTransactionItems: number }`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/debts/__tests__/repair.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, type LocalTransaction } from "@/lib/dexie/db";
import { DEFAULT_HOUSEHOLD_ID } from "@/lib/household";
import type { SyncQueueItem } from "@/types/sync";
import { DEBT_ID_REPAIR_KEY, repairLegacyDebtIds } from "../repair";
import { createTestDebt, createTestPayment } from "./test-utils";
import { cents } from "@/test/cents";

const USER_ID = "12345678-1234-5678-1234-567812345678";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TX_ID = "8b5f8e0e-1111-4e5a-9a4e-0000000000aa";
const OLD = "2026-09-01T00:00:00.000Z";

function queueItem(overrides: Partial<SyncQueueItem>): SyncQueueItem {
  return {
    id: crypto.randomUUID(),
    household_id: DEFAULT_HOUSEHOLD_ID,
    entity_type: "debt",
    entity_id: "legacy-debt",
    operation: { op: "create", payload: {}, idempotencyKey: "legacy-key", lamportClock: 1 },
    device_id: "device-1",
    user_id: USER_ID,
    status: "failed",
    retry_count: 0,
    max_retries: 3,
    error_message: "invalid input syntax for type uuid",
    created_at: OLD,
    updated_at: OLD,
    synced_at: null,
    next_retry_at: null,
    ...overrides,
  };
}

function linkedTransaction(): LocalTransaction {
  return {
    id: TX_ID,
    date: "2026-09-01",
    description: "Loan payment",
    amount_cents: cents(2500),
    type: "expense",
    status: "cleared",
    visibility: "household",
    tagged_user_ids: [],
    debt_id: "legacy-debt",
    household_id: DEFAULT_HOUSEHOLD_ID,
    currency_code: "PHP",
    created_by_user_id: USER_ID,
    device_id: "device-1",
    created_at: OLD,
    updated_at: OLD,
  };
}

async function seedLegacy() {
  await db.debts.add(createTestDebt({ id: "legacy-debt", household_id: DEFAULT_HOUSEHOLD_ID }));
  await db.debtPayments.bulkAdd([
    createTestPayment({
      id: "legacy-pay",
      debt_id: "legacy-debt",
      transaction_id: TX_ID,
      created_at: OLD,
    }),
    createTestPayment({
      id: "legacy-rev",
      debt_id: "legacy-debt",
      transaction_id: TX_ID,
      is_reversal: true,
      reverses_payment_id: "legacy-pay",
      created_at: "2026-09-02T00:00:00.000Z",
    }),
  ]);
  await db.transactions.add(linkedTransaction());
  await db.events.add({
    id: crypto.randomUUID(),
    household_id: DEFAULT_HOUSEHOLD_ID,
    entity_type: "debt",
    entity_id: "legacy-debt",
    op: "create",
    payload: {},
    idempotency_key: "legacy-key",
    event_version: 1,
    actor_user_id: USER_ID,
    device_id: "device-1",
    lamport_clock: 1,
    vector_clock: {},
    timestamp: OLD,
  });
  await db.syncQueue.bulkAdd([
    queueItem({}),
    queueItem({
      entity_type: "transaction",
      entity_id: TX_ID,
      operation: {
        op: "create",
        payload: { id: TX_ID, debt_id: "legacy-debt" },
        idempotencyKey: "tx-key",
        lamportClock: 1,
      },
      created_at: "2026-09-01T00:00:01.000Z",
    }),
  ]);
}

describe("repairLegacyDebtIds", () => {
  beforeEach(async () => {
    await Promise.all([
      db.debts.clear(),
      db.internalDebts.clear(),
      db.debtPayments.clear(),
      db.transactions.clear(),
      db.events.clear(),
      db.syncQueue.clear(),
      db.meta.clear(),
    ]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("with no debt rows only drops stale debt items and sets the flag", async () => {
    await db.syncQueue.add(queueItem({}));
    const result = await repairLegacyDebtIds(USER_ID);
    expect(result).toEqual({ ran: true, rekeyed: 0, queued: 0, rewrittenTransactionItems: 0 });
    expect(await db.syncQueue.count()).toBe(0);
    expect((await db.meta.get(DEBT_ID_REPAIR_KEY))?.value).toBe("done");
  });

  it("re-keys rows and every reference, and rebuilds the debt queue", async () => {
    await seedLegacy();
    const result = await repairLegacyDebtIds(USER_ID);
    expect(result).toMatchObject({
      ran: true,
      rekeyed: 3,
      queued: 3,
      rewrittenTransactionItems: 1,
    });

    const [debt] = await db.debts.toArray();
    expect(debt?.id).toMatch(UUID);
    const payments = await db.debtPayments.toArray();
    const original = payments.find((p) => !p.is_reversal);
    const reversal = payments.find((p) => p.is_reversal);
    expect(original?.debt_id).toBe(debt?.id);
    expect(reversal?.reverses_payment_id).toBe(original?.id);
    expect((await db.transactions.get(TX_ID))?.debt_id).toBe(debt?.id);
    expect((await db.events.toArray())[0]?.entity_id).toBe(debt?.id);

    const items = await db.syncQueue.toArray();
    items.sort((a, b) => a.created_at.localeCompare(b.created_at));
    expect(items.map((i) => i.entity_type)).toEqual([
      "debt",
      "transaction",
      "debt_payment",
      "debt_payment",
    ]);
    const txItem = items[1];
    expect(txItem).toMatchObject({ status: "queued", retry_count: 0, next_retry_at: null });
    expect(txItem?.operation.payload.debt_id).toBe(debt?.id);
    expect(items[3]?.operation.payload.reverses_payment_id).toBe(original?.id);
    expect(items[2]?.operation.payload).not.toHaveProperty("idempotency_key");
  });

  it("is a no-op on the second run", async () => {
    await seedLegacy();
    await repairLegacyDebtIds(USER_ID);
    const before = await db.syncQueue.count();
    expect((await repairLegacyDebtIds(USER_ID)).ran).toBe(false);
    expect(await db.syncQueue.count()).toBe(before);
  });

  it("writes nothing and leaves the flag unset when the transaction throws", async () => {
    await seedLegacy();
    vi.spyOn(db.syncQueue, "bulkAdd").mockRejectedValueOnce(new Error("boom"));
    await expect(repairLegacyDebtIds(USER_ID)).rejects.toThrow("boom");
    expect(await db.debts.get("legacy-debt")).toBeDefined();
    expect(await db.meta.get(DEBT_ID_REPAIR_KEY)).toBeUndefined();
    expect(await db.syncQueue.count()).toBe(2);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/debts/__tests__/repair.test.ts`
Expected: FAIL (cannot resolve `../repair`).

- [ ] **Step 3: Implement**

```ts
// src/lib/debts/repair.ts
/**
 * One-shot repair for debt rows written with nanoid ids, which the uuid
 * columns reject, and for the event-envelope queue items that can never
 * succeed. Runs after sign-in, before auto-sync starts, because building
 * queue items needs the user id and async sync metadata. Guarded by a
 * db.meta flag; the whole rewrite commits in one transaction or not at all.
 */
import { db } from "@/lib/dexie/db";
import { buildSyncQueueItem } from "@/lib/offline/syncQueue";
import type { Debt, DebtPayment, InternalDebt } from "@/types/debt";
import type { SyncQueueItem } from "@/types/sync";
import { toDebtInsert, toDebtPaymentInsert, toInternalDebtInsert } from "./payloads";

export const DEBT_ID_REPAIR_KEY = "debtIdRepair";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEBT_ENTITY_TYPES: ReadonlySet<string> = new Set(["debt", "internal_debt", "debt_payment"]);
const TRANSACTION_DEBT_KEYS = ["debt_id", "internal_debt_id"] as const;

export interface DebtIdRepairResult {
  ran: boolean;
  rekeyed: number;
  queued: number;
  rewrittenTransactionItems: number;
}

/**
 * Debts reference nothing, so their creates may sync ahead of every
 * outstanding item, including transactions whose debt_id points at them.
 */
async function buildDebtItems(
  debts: Debt[],
  internalDebts: InternalDebt[],
  userId: string
): Promise<SyncQueueItem[]> {
  const items: SyncQueueItem[] = [];
  for (const debt of debts) {
    items.push(await buildSyncQueueItem("debt", debt.id, "create", toDebtInsert(debt), userId));
  }
  for (const debt of internalDebts) {
    items.push(
      await buildSyncQueueItem(
        "internal_debt",
        debt.id,
        "create",
        toInternalDebtInsert(debt),
        userId
      )
    );
  }

  const outstanding = await db.syncQueue
    .where("status")
    .anyOf("queued", "syncing", "failed")
    .toArray();
  const earliest = Math.min(Date.now(), ...outstanding.map((item) => Date.parse(item.created_at)));
  return items.map((item, index) => {
    const stamp = new Date(earliest - items.length + index).toISOString();
    return { ...item, created_at: stamp, updated_at: stamp };
  });
}

function rekeyTransactionPayload(
  payload: Record<string, unknown>,
  idMap: ReadonlyMap<string, string>
): Record<string, unknown> | null {
  const next = { ...payload };
  let changed = false;
  for (const key of TRANSACTION_DEBT_KEYS) {
    const value = payload[key];
    const replacement = typeof value === "string" ? idMap.get(value) : undefined;
    if (replacement) {
      next[key] = replacement;
      changed = true;
    }
  }
  return changed ? next : null;
}

export async function repairLegacyDebtIds(userId: string): Promise<DebtIdRepairResult> {
  const flag = await db.meta.get(DEBT_ID_REPAIR_KEY);
  if (flag?.value === "done") {
    return { ran: false, rekeyed: 0, queued: 0, rewrittenTransactionItems: 0 };
  }

  const [debts, internalDebts, payments] = await Promise.all([
    db.debts.toArray(),
    db.internalDebts.toArray(),
    db.debtPayments.toArray(),
  ]);

  const idMap = new Map<string, string>();
  for (const row of [...debts, ...internalDebts, ...payments]) {
    if (!UUID_PATTERN.test(row.id)) idMap.set(row.id, crypto.randomUUID());
  }
  const rekey = (id: string) => idMap.get(id) ?? id;
  const rekeyOptional = (id: string | undefined) => (id === undefined ? undefined : rekey(id));

  const repairedDebts = debts.map((debt) => ({ ...debt, id: rekey(debt.id) }));
  const repairedInternalDebts = internalDebts.map((debt) => ({ ...debt, id: rekey(debt.id) }));
  const repairedPayments: DebtPayment[] = payments
    .map((payment) => ({
      ...payment,
      id: rekey(payment.id),
      debt_id: rekeyOptional(payment.debt_id),
      internal_debt_id: rekeyOptional(payment.internal_debt_id),
      reverses_payment_id: rekeyOptional(payment.reverses_payment_id),
    }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const debtItems = await buildDebtItems(repairedDebts, repairedInternalDebts, userId);
  const paymentItems: SyncQueueItem[] = [];
  for (const payment of repairedPayments) {
    paymentItems.push(
      await buildSyncQueueItem(
        "debt_payment",
        payment.id,
        "create",
        toDebtPaymentInsert(payment),
        userId
      )
    );
  }

  let rewrittenTransactionItems = 0;
  await db.transaction(
    "rw",
    [
      db.debts,
      db.internalDebts,
      db.debtPayments,
      db.transactions,
      db.events,
      db.syncQueue,
      db.meta,
    ],
    async () => {
      await db.debts.bulkDelete(debts.map((debt) => debt.id));
      await db.debts.bulkPut(repairedDebts);
      await db.internalDebts.bulkDelete(internalDebts.map((debt) => debt.id));
      await db.internalDebts.bulkPut(repairedInternalDebts);
      await db.debtPayments.bulkDelete(payments.map((payment) => payment.id));
      await db.debtPayments.bulkPut(repairedPayments);

      if (idMap.size > 0) {
        await db.transactions
          .filter((tx) => idMap.has(tx.debt_id ?? "") || idMap.has(tx.internal_debt_id ?? ""))
          .modify((tx) => {
            tx.debt_id = rekeyOptional(tx.debt_id);
            tx.internal_debt_id = rekeyOptional(tx.internal_debt_id);
          });
        await db.events
          .where("entity_id")
          .anyOf([...idMap.keys()])
          .modify((event) => {
            event.entity_id = rekey(event.entity_id);
          });
      }

      // Envelope-shaped debt items can never succeed, whatever their status
      const queue = await db.syncQueue.toArray();
      await db.syncQueue.bulkDelete(
        queue.filter((item) => DEBT_ENTITY_TYPES.has(item.entity_type)).map((item) => item.id)
      );

      const now = new Date().toISOString();
      for (const item of queue) {
        if (item.entity_type !== "transaction") continue;
        if (item.status !== "queued" && item.status !== "failed") continue;
        const payload = rekeyTransactionPayload(item.operation.payload, idMap);
        if (!payload) continue;
        await db.syncQueue.put({
          ...item,
          operation: { ...item.operation, payload },
          status: "queued",
          retry_count: 0,
          next_retry_at: null,
          error_message: null,
          updated_at: now,
        });
        rewrittenTransactionItems++;
      }

      await db.syncQueue.bulkAdd([...debtItems, ...paymentItems]);
      await db.meta.put({ key: DEBT_ID_REPAIR_KEY, value: "done" });
    }
  );

  return {
    ran: true,
    rekeyed: idMap.size,
    queued: debtItems.length + paymentItems.length,
    rewrittenTransactionItems,
  };
}
```

A `queued` transaction item is already `queued`; setting `retry_count` 0 on it is harmless and keeps the code to one branch.

- [ ] **Step 4: Run before auto-sync starts**

In `src/routes/__root.tsx` import `{ repairLegacyDebtIds } from "@/lib/debts/repair"` and `{ reportError } from "@/lib/sentry"`, and replace the auto-sync effect with:

```tsx
// Repair legacy debt ids before the first drain, so the processor never
// sends a nanoid id; then hand over to auto-sync
useEffect(() => {
  if (!user?.id) return;
  const userId = user.id;
  let stopped = false;

  void repairLegacyDebtIds(userId)
    .catch((error: unknown) =>
      reportError(error, { subsystem: "debt-repair", operation: "repairLegacyDebtIds" })
    )
    .finally(() => {
      if (stopped) return;
      console.log("Starting auto-sync for user:", userId);
      autoSyncManager.start(userId);
    });

  return () => {
    stopped = true;
    console.log("Stopping auto-sync");
    autoSyncManager.stop();
  };
}, [user?.id]); // Only re-run if user ID changes (login/logout), not on user object updates
```

A failed repair still starts auto-sync (the job retries at the next sign-in or reload because the flag stays unset).

- [ ] **Step 5: Verify**

```bash
npx vitest run src/lib/debts/__tests__/repair.test.ts
npx tsc --noEmit -p tsconfig.json; echo "exit $?"
npx tsc --noEmit -p tsconfig.strict.json; echo "exit $?"
npm run lint
```

Expected: 4 PASS; both tsc exit 0; lint 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/debts/repair.ts src/lib/debts/__tests__/repair.test.ts src/routes/__root.tsx
git commit -m "fix(debts): re-key legacy debt ids and rebuild their queue items"
```

---

### Task 12: Local-stack integration test

Runs against `supabase start` only when `DEBT_SYNC_INTEGRATION=1`; skipped in `npx vitest run`, pre-push and CI.

**Files:**

- Create: `src/lib/debts/__tests__/debt-sync.integration.test.ts`

- [ ] **Step 1: Confirm the stack and fixture user**

```bash
supabase status -o env | grep -c API_URL        # expect 1
psql "$(supabase status -o env | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')" -tAc \
  "select count(*) from auth.users where email = 'test@example.com'"   # expect 1
```

If the user count is 0, run `npm run test:e2e:smoke` once (its global setup creates the fixture users on local stacks).

- [ ] **Step 2: Write the test**

```ts
// src/lib/debts/__tests__/debt-sync.integration.test.ts
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testUsers } from "../../../../tests/e2e/fixtures/test-users";

const enabled = process.env.DEBT_SYNC_INTEGRATION === "1";
const apiUrl = process.env.LOCAL_API_URL ?? "http://127.0.0.1:54321";
const anonKey = process.env.LOCAL_ANON_KEY ?? "anon";

vi.mock("@/lib/supabase", async () => {
  const { createClient: create } = await import("@supabase/supabase-js");
  const client = create(
    process.env.LOCAL_API_URL ?? "http://127.0.0.1:54321",
    process.env.LOCAL_ANON_KEY ?? "anon",
    { auth: { persistSession: false } }
  );
  return { supabase: client, untypedSupabase: client };
});

describe.skipIf(!enabled)("debt sync against the local stack", () => {
  const admin = createClient(apiUrl, process.env.LOCAL_SERVICE_ROLE_KEY ?? "service", {
    auth: { persistSession: false },
  });
  let userId = "";
  let debtId = "";
  let transactionId = "";

  beforeAll(async () => {
    const { supabase } = await import("@/lib/supabase");
    const { data, error } = await supabase.auth.signInWithPassword(testUsers.primary);
    if (error || !data.user) throw error ?? new Error("sign-in failed");
    userId = data.user.id;
  });

  afterAll(async () => {
    if (!enabled || process.env.DEBT_SYNC_KEEP_ROWS === "1") return;
    await admin.from("debt_payments").delete().eq("transaction_id", transactionId);
    await admin.from("transactions").delete().eq("id", transactionId);
    await admin.from("debts").delete().eq("id", debtId);
  });

  it("creates, pays, reverses and matches the server balance", async () => {
    const { db } = await import("@/lib/dexie/db");
    const { DEFAULT_HOUSEHOLD_ID } = await import("@/lib/household");
    const { createExternalDebt } = await import("@/lib/debts/crud");
    const { calculateDebtBalance } = await import("@/lib/debts/balance");
    const { createOfflineTransaction, updateOfflineTransaction } = await import(
      "@/lib/offline/transactions"
    );
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
    debtId = debt.id;

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
    transactionId = created.data.id;

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
});
```

If the `SERVICE_ROLE_KEY` cleanup cannot delete because of the FK order, delete `debt_payments` first (as written), then `transactions`, then `debts`.

- [ ] **Step 3: Run it**

```bash
eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
DEBT_SYNC_INTEGRATION=1 LOCAL_API_URL="$API_URL" LOCAL_ANON_KEY="$ANON_KEY" LOCAL_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  npx vitest run src/lib/debts/__tests__/debt-sync.integration.test.ts
npx vitest run src/lib/debts/__tests__/debt-sync.integration.test.ts   # without the flag
```

Expected: first run 1 PASS; second run 1 skipped. On failure, read the processor's error for the failed item (`db.syncQueue` `error_message`) before changing code: a `42501` RLS error means the fixture user's household differs from `DEFAULT_HOUSEHOLD_ID` (check `select household_id from profiles where id = '<userId>'` and record it in Decisions & Deferrals).

- [ ] **Step 4: SQL cross-check** (spec: "check the server rows by SQL")

```bash
DEBT_SYNC_KEEP_ROWS=1 DEBT_SYNC_INTEGRATION=1 LOCAL_API_URL="$API_URL" LOCAL_ANON_KEY="$ANON_KEY" LOCAL_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  npx vitest run src/lib/debts/__tests__/debt-sync.integration.test.ts
DB_URL="$(supabase status -o env | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')"
psql "$DB_URL" -c "
select d.id, d.original_amount_cents - coalesce(sum(p.amount_cents), 0) as balance, count(p.id) as payments
from debts d left join debt_payments p on p.debt_id = d.id
where d.name like 'Integration %' group by d.id;"
```

Expected: one row, `balance = 6000`, `payments = 3`. Then remove the kept rows:

```bash
psql "$DB_URL" -c "
delete from debt_payments where debt_id in (select id from debts where name like 'Integration %');
delete from transactions where description = 'Debt sync integration';
delete from debts where name like 'Integration %';"
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/debts/__tests__/debt-sync.integration.test.ts
git commit -m "test(debts): local-stack round trip for debt sync"
```

---

### Task 13: Acceptance, docs, merge

**Files:**

- Modify: this plan (Progress, Acceptance results, Decisions & Deferrals)
- Modify: `docs/plans/2026-09-30-guardrails-roadmap.md` (Resume state)

- [ ] **Step 1: Gates**

```bash
npx tsc --noEmit -p tsconfig.json; echo "tsc app $?"
npx tsc --noEmit -p tsconfig.tests.json; echo "tsc tests $?"
npx tsc --noEmit -p tsconfig.strict.json; echo "tsc strict $?"
npm run lint
npx vitest run 2>&1 | tail -6
npm run build; echo "build $?"
npm run size
PW_TEST_HTML_REPORT_OPEN=never npm run test:e2e:smoke
```

Expected: tsc 0/0/0, lint 0 errors, vitest all pass (count above the Task 0 baseline), build 0, bundle ≤ 355 KB gz, smoke 11/11. Record each number in Acceptance results.

- [ ] **Step 2: Whole-branch review**

Use superpowers:requesting-code-review on `main..debt-sync-defects`. Fix Critical/Important findings; record declined Minor items in Decisions & Deferrals.

- [ ] **Step 3: Docs**

Fill Acceptance results below; check every Progress box; append a dated Resume state bullet to the roadmap (branch merged or pending, gates, what the user runs next: push, then the production SQL check in Step 5).

- [ ] **Step 4: Merge locally**

```bash
git switch main && git merge --ff-only debt-sync-defects && git branch -d debt-sync-defects
git log --oneline -3
```

Then ask the user to run `! git push origin main` (pre-push runs all gates), and confirm CI with `gh run list --limit 4`.

- [ ] **Step 5: Production check (user, after the push)** (spec section 7)

```sql
select (select count(*) from debts) as debts,
       (select count(*) from internal_debts) as internal_debts,
       (select count(*) from debt_payments) as debt_payments;
select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1;
```

Expected: `0, 0, 0`. Record the publication list in Decisions & Deferrals (it decides the realtime deferral's revisit).

## Acceptance results

(filled in Task 13)

## Decisions & Deferrals

Planning decisions (2026-10-06, not in the spec):

- **Queue `created_at` is strictly increasing per tab (Task 2).** Why: the processor sorts FIFO on `created_at`, and a same-millisecond tie fell back to the random UUID key, which could send a payment before its transaction. Revisit: if two tabs enqueue concurrently in practice (cross-tab order is still by wall clock).
- **Prepare/apply split with a `DebtLedgerView`.** Why: an edit reverses and re-pays the same debt; both prepares must see one working balance so one status change is queued, and nothing is written until the single transaction. Rejected: computing everything inside the Dexie transaction (clocks and device id are unsafe in a transaction zone, `syncQueue.ts`).
- **Events reuse the queue item's Lamport clock and idempotency key.** Why: one clock tick per mutation instead of two; the local audit trail and the outbox share a key.
- **`DebtPayment.idempotency_key` becomes optional.** Why: the server has no such column, pulled rows have none, and the event now holds the key. Old local rows keep theirs.
- **Pulled payments take `updated_at = created_at`.** Why: the server ledger has no `updated_at`; local rows are immutable too.
- **Repair stamps debt creates before the earliest outstanding queue item.** Why: queued transaction items may reference a legacy debt id; debts have no foreign keys, so syncing them first is always safe, while payments go last (they reference transactions).
- **The UI stops calling `handleTransactionDelete` before the delete mutation.** Why: `deleteOfflineTransaction` already reverses linked payments, and the extra call committed the reversal separately from the delete. The toast now uses `isTransactionLinkedToDebt`.
- **Integration test lives in `src/` and is env-gated.** Why: the `tests/` tsc program sets `types: ["node"]`, which drops the Vite env types that `src/` modules need; vitest's config pins a fake Supabase URL, so the test mocks `@/lib/supabase` with a real local client.
- **The nanoid ban is a separate ESLint block.** Why: `no-restricted-imports` in a later block replaces earlier ones. The two directories are in `asCentsAllowed` today, so no conflict; 2c's allow-list narrowing must merge `restrictAsCents` into this block.

From the spec (section 9), unchanged: scope is end-to-end sync without UI; debts move to the standard outbox; legacy rows are re-keyed; realtime publication unchanged; catch-up first run still looks back 24 hours.

Resolved at plan approval (2026-10-06; the user chose subagent-driven execution without answering, so the recommended defaults apply and can be overridden):

- **Deleting a debt-linked transaction cannot sync (deferred).** `debt_payments.transaction_id` references `transactions(id)` with no `ON DELETE` action (`20251110194431_add_debt_tracking.sql:100`) and the ledger is append-only, so the server rejects the delete (`violates foreign key constraint`, non-retryable). Unreachable today: no UI creates debts. Revisit: debts UI spec (soft-delete transactions, or block deleting debt-linked transactions).
- **A debt adjustment that cannot be prepared fails the whole transaction edit (decided).** Why: atomic writes; before, the edit committed and the adjustment was silently skipped. Only a missing or archived debt triggers it. Revisit: n/a.
- **Unlinking a debt now reverses its payment (decided, Task 7).** Why: the old guard checked only the updated row's link, so choosing "None" left the payment standing. Revisit: n/a.
