import { appendTogether } from "@/lib/events/log";
import { sameOwnership } from "@/lib/events/ownership";
import { isCreditCard } from "@/lib/accounts/events";
import type { AccountRow } from "@/lib/accounts/projection";
import { cardPaymentEnvelope, UNASSIGNED_ENVELOPE } from "@/lib/allocations/events";
import { diffCents, ZERO_CENTS, type Cents } from "@/lib/currency";
import { moneyIn, readAccountMoney, reservationFreed } from "@/lib/transactions/money";
import type { Actor } from "./accounts";
import { addAllocation, reserveToPayFrom } from "./allocations";
import { requireAccount } from "./records";
import { addTransfer } from "./transfers";

export interface PayCardInput {
  cardId: string;
  fromAccountId: string;
  amountCents: Cents;
  date: string;
  /** From the Paying Account: move what Card Payment lacks from its Unassigned first. */
  coverShortfall?: boolean;
}

/** Retired accounts are refused by `addTransfer`, which undoes the whole change. */
function checkPayer(card: AccountRow, payer: AccountRow): void {
  if (!isCreditCard(card)) throw new Error(`${card.name} isn't a credit card.`);
  if (isCreditCard(payer)) {
    throw new Error(`Pay ${card.name} from a bank, cash or e-wallet account.`);
  }
  if (!sameOwnership(card, payer)) {
    throw new Error(`Choose an account seen by the same people as ${card.name}.`);
  }
}

async function heldFor(card: AccountRow, accountId: string | null): Promise<Cents> {
  if (accountId === null) return ZERO_CENTS;
  const envelopes = (await readAccountMoney()).get(accountId)?.envelopes;
  return moneyIn(envelopes, cardPaymentEnvelope(card.id));
}

/**
 * Works offline; a transfer from the payer's Card Payment into the card. Paid
 * from an account other than the card's Paying Account, the Paying Account's
 * reservation is freed into its Unassigned (up to the payment) and the payer's
 * Unassigned is reserved instead, all as one change. The payer's Unassigned
 * may go negative, like any allocation. Paid from the Paying Account with
 * `coverShortfall`, only what its Card Payment lacks moves in from its
 * Unassigned first, so Card Payment ends at ₱0.00; Unassigned may go negative.
 */
export function payCard(actor: Actor, input: PayCardInput): Promise<{ id: string }> {
  return appendTogether(async () => {
    const card = await requireAccount(input.cardId);
    const payer = await requireAccount(input.fromAccountId);
    checkPayer(card, payer);
    const { payingAccountId } = card;
    if (payingAccountId === payer.id && input.coverShortfall) {
      const shortfall = diffCents(input.amountCents, await heldFor(card, payer.id));
      if (shortfall > 0) {
        await addAllocation(actor, {
          date: input.date,
          accountId: payer.id,
          from: UNASSIGNED_ENVELOPE,
          to: cardPaymentEnvelope(card.id),
          amountCents: shortfall,
        });
      }
    }
    if (payingAccountId !== payer.id) {
      const freed = reservationFreed(await heldFor(card, payingAccountId), input.amountCents);
      if (payingAccountId !== null && freed > 0) {
        await addAllocation(actor, {
          date: input.date,
          accountId: payingAccountId,
          from: cardPaymentEnvelope(card.id),
          to: UNASSIGNED_ENVELOPE,
          amountCents: freed,
        });
      }
      await reserveToPayFrom(actor, {
        account: payer,
        cardId: card.id,
        amountCents: input.amountCents,
        date: input.date,
      });
    }
    return addTransfer(actor, {
      date: input.date,
      amountCents: input.amountCents,
      fromAccountId: payer.id,
      toAccountId: card.id,
      fromEnvelope: cardPaymentEnvelope(card.id),
      toEnvelope: cardPaymentEnvelope(card.id),
    });
  });
}
