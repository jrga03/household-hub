import { expect } from "vitest";
import { sumCents } from "@/lib/currency";
import type { LoggedEvent } from "@/lib/events/log";
import type { AccountMoney } from "./money";

export const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
export const BANK = "aaaaaaaa-0000-4000-8000-000000000001";
export const WALLET = "aaaaaaaa-0000-4000-8000-000000000002";
export const CARD = "aaaaaaaa-0000-4000-8000-000000000003";
export const GROCERIES = "cccccccc-0000-4000-8000-000000000001";
export const RENT = "cccccccc-0000-4000-8000-000000000002";

export const hlcAt = (millis: number) => `${String(millis).padStart(15, "0")}-000000-device-b`;

export function event(
  id: string,
  entityType: string,
  entityId: string,
  eventType: string,
  millis: number,
  payload: Record<string, unknown> = {},
  eventVersion = 1
): LoggedEvent {
  return {
    id,
    householdId: HOUSEHOLD,
    visibility: "household",
    ownerUserId: null,
    entityType,
    entityId,
    eventType,
    eventVersion,
    hlc: hlcAt(millis),
    deviceId: "device-b",
    actorUserId: "user-b",
    payload,
  };
}

export const account = (
  id: string,
  entityId: string,
  millis: number,
  details: Record<string, unknown>
) =>
  event(
    id,
    "account",
    entityId,
    "account.created",
    millis,
    { payingAccountId: null, ...details },
    2
  );

export const transaction = (
  id: string,
  entityId: string,
  millis: number,
  details: Record<string, unknown>,
  eventType = "transaction.created"
) =>
  event(
    id,
    "transaction",
    entityId,
    eventType,
    millis,
    {
      date: "2026-10-12",
      categoryId: null,
      payingAccountId: null,
      description: "",
      notes: "",
      status: "cleared",
      ...details,
    },
    2
  );

export const txId = (n: number) => `dddddddd-0000-4000-8000-00000000000${n}`;

export function expectBalanceEqualsEnvelopes(
  money: Map<string, AccountMoney>,
  accountIds: string[]
) {
  for (const accountId of accountIds) {
    const accountMoney = money.get(accountId);
    if (!accountMoney?.envelopes) throw new Error(`No envelopes for ${accountId}`);
    const { unassigned, categories, cardPayments } = accountMoney.envelopes;
    expect(accountMoney.balance).toBe(
      sumCents([unassigned, ...categories.values(), ...cardPayments.values()])
    );
  }
}

export const bank = account("a-bank", BANK, 100, {
  name: "Bank",
  type: "bank",
  startingBalanceCents: 100000,
});
export const wallet = account("a-wallet", WALLET, 200, {
  name: "Wallet",
  type: "cash",
  startingBalanceCents: 0,
});
export const card = account("a-card", CARD, 300, {
  name: "Card",
  type: "credit_card",
  startingBalanceCents: 50000,
  payingAccountId: BANK,
});
