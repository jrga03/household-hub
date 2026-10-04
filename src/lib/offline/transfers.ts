/**
 * Transfer grouping + local Dexie fallback for useTransfers (review R11)
 *
 * A transfer is stored as two linked transactions sharing a
 * transfer_group_id: one expense (from account) + one income (to account).
 * `groupTransferLegs` is the single pairing implementation used by BOTH the
 * Supabase path in hooks/useTransfers.ts and the offline path here, so the
 * two sources can never drift: only complete expense+income pairs are shown,
 * sorted by date descending, with the expense leg providing the canonical
 * date/amount/description.
 *
 * @module offline/transfers
 */

import { db, type LocalTransaction } from "@/lib/dexie/db";
import { validateAmount, type Cents } from "@/lib/currency";
import { createOfflineTransactionsBatch } from "./transactions";
import type { OfflineOperationResult } from "./types";

/** One transaction leg of a transfer, shaped like the Supabase select. */
export interface TransferLeg {
  id: string;
  date: string;
  amount_cents: Cents;
  description: string;
  transfer_group_id: string | null;
  type: string;
  account: { id: string; name: string } | null;
}

/** A complete transfer pair as rendered by TransferList. */
export interface TransferGroup {
  id: string;
  date: string;
  amount_cents: Cents;
  transfer_group_id: string | null;
  description: string;
  from_account: { id: string; name: string } | null;
  to_account: { id: string; name: string } | null;
  from_account_name: string;
  to_account_name: string;
}

/**
 * Groups transfer legs into complete pairs (pure function, shared by the
 * server and offline paths). Incomplete pairs - a leg whose partner hasn't
 * synced - are filtered out as a data-integrity safety check, matching the
 * original server-side behavior.
 */
export function groupTransferLegs(legs: TransferLeg[]): TransferGroup[] {
  const transferGroups = new Map<
    string,
    { expense: TransferLeg | null; income: TransferLeg | null }
  >();

  for (const leg of legs) {
    if (!leg.transfer_group_id) continue;

    if (!transferGroups.has(leg.transfer_group_id)) {
      transferGroups.set(leg.transfer_group_id, { expense: null, income: null });
    }

    const group = transferGroups.get(leg.transfer_group_id)!;
    if (leg.type === "expense") {
      group.expense = leg;
    } else {
      group.income = leg;
    }
  }

  return Array.from(transferGroups.values())
    .filter((g) => g.expense && g.income) // Only show complete transfer pairs
    .map((g) => ({
      id: g.expense!.id,
      date: g.expense!.date,
      amount_cents: g.expense!.amount_cents,
      transfer_group_id: g.expense!.transfer_group_id,
      description: g.expense!.description,
      from_account: g.expense!.account,
      to_account: g.income!.account,
      from_account_name: g.expense!.account?.name || "Unknown",
      to_account_name: g.income!.account?.name || "Unknown",
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Local mirror of the useTransfers Supabase query: transfer-paired
 * transactions (transfer_group_id NOT NULL) for the household, joined with
 * account names from the local mirror and grouped exactly like the server
 * path.
 */
export async function getLocalTransfers(householdId: string): Promise<TransferGroup[]> {
  const [rows, accounts] = await Promise.all([
    db.transactions
      .filter((t) => t.household_id === householdId && !!t.transfer_group_id)
      .toArray(),
    db.accounts.toArray(),
  ]);

  const accountById = new Map(accounts.map((a) => [a.id, { id: a.id, name: a.name }]));

  const legs: TransferLeg[] = rows.map((t) => ({
    id: t.id,
    date: t.date,
    amount_cents: t.amount_cents,
    description: t.description,
    transfer_group_id: t.transfer_group_id ?? null,
    type: t.type,
    account: t.account_id ? (accountById.get(t.account_id) ?? null) : null,
  }));

  return groupTransferLegs(legs);
}

export interface TransferInput {
  from_account_id: string;
  to_account_id: string;
  from_account_name: string;
  to_account_name: string;
  amount_cents: Cents;
  date: string;
  description?: string;
}

/**
 * Creates both legs of a transfer through the outbox: one Dexie transaction
 * writes the two rows and their two sync-queue items. The legs sync as two
 * ordinary creates; the server's check_transfer_integrity() accepts either
 * leg first and validates the second against it.
 */
export async function createOfflineTransfer(
  input: TransferInput,
  userId: string
): Promise<OfflineOperationResult<LocalTransaction[]>> {
  if (input.from_account_id === input.to_account_id) {
    return { success: false, error: "Cannot transfer to the same account", isTemporary: false };
  }
  if (input.amount_cents === 0 || !validateAmount(input.amount_cents)) {
    return { success: false, error: "Invalid transfer amount", isTemporary: false };
  }

  const shared = {
    date: input.date,
    amount_cents: input.amount_cents,
    status: "pending",
    visibility: "household",
    transfer_group_id: crypto.randomUUID(),
  } as const;

  return createOfflineTransactionsBatch(
    [
      {
        ...shared,
        type: "expense",
        account_id: input.from_account_id,
        description: input.description || `Transfer to ${input.to_account_name}`,
      },
      {
        ...shared,
        type: "income",
        account_id: input.to_account_id,
        description: input.description || `Transfer from ${input.from_account_name}`,
      },
    ],
    userId
  );
}
