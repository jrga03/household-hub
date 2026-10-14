import { requestSync } from "@/lib/sync/triggers";
import { isCreditCard } from "@/lib/accounts/events";
import { getAccount, type AccountRow } from "@/lib/accounts/projection";
import { AMOUNT_PROBLEM, absCents, diffCents, isAmount, type Cents } from "@/lib/currency";
import {
  BALANCE_CORRECTION_CREATED,
  BALANCE_CORRECTION_ENTITY,
  BALANCE_CORRECTION_REMOVED,
  BALANCE_CORRECTION_RESTORED,
  BALANCE_CORRECTION_VERSIONS,
  type CorrectionEnvelope,
} from "@/lib/corrections/events";
import { getBalanceCorrection, type BalanceCorrectionRow } from "@/lib/corrections/projection";
import { readClearedBalanceAt } from "@/lib/transactions/money";
import { isLocalDate } from "@/lib/transactions/events";
import { todayLocalDate } from "@/lib/utils/dates";
import type { Actor } from "./accounts";
import { appenderFor } from "./append";
import { changeEach } from "./bulk";
import { refuseRetired, requireAccount, requireCategoryFor } from "./records";

export interface CorrectionInput {
  accountId: string;
  /** "yyyy-MM-dd": the day the member saw the balance, today or earlier. */
  date: string;
  /** What the bank showed at the end of that day; for a credit card, the amount owed. */
  actualBalanceCents: Cents;
  envelope: CorrectionEnvelope;
}

const appendCorrectionEvent = appenderFor(BALANCE_CORRECTION_ENTITY, BALANCE_CORRECTION_VERSIONS);

function checkDate(date: string): void {
  if (!isLocalDate(date)) throw new Error("Choose a date.");
  if (date > todayLocalDate()) throw new Error("Choose today or an earlier date.");
}

async function checkEnvelope(envelope: CorrectionEnvelope, account: AccountRow): Promise<void> {
  if (envelope.kind === "category") refuseRetired(await requireCategoryFor(envelope.id, account));
}

/** Where a card's difference moves its Card Payment: its Paying Account, which must be in use. */
async function requirePayingAccount(card: AccountRow): Promise<string> {
  const paying = card.payingAccountId === null ? undefined : await getAccount(card.payingAccountId);
  if (!paying || isCreditCard(paying)) {
    throw new Error(`Choose the account ${card.name} is paid from first.`);
  }
  refuseRetired(paying);
  return paying.id;
}

/**
 * Records the difference between the account's cleared balance at the end of
 * the date and the balance the member saw, so the two then match (ADR 0009).
 * Resolves null, recording nothing, when they already match. Works offline.
 */
export async function recordBalanceCorrection(
  actor: Actor,
  input: CorrectionInput
): Promise<{ id: string } | null> {
  checkDate(input.date);
  const account = await requireAccount(input.accountId);
  refuseRetired(account);
  await checkEnvelope(input.envelope, account);
  const payingAccountId = isCreditCard(account) ? await requirePayingAccount(account) : null;

  const cleared = await readClearedBalanceAt(account.id, input.date);
  const difference = diffCents(input.actualBalanceCents, cleared);
  if (difference === 0) return null;
  const amountCents = absCents(difference);
  if (!isAmount(amountCents)) throw new Error(AMOUNT_PROBLEM);

  const id = crypto.randomUUID();
  await appendCorrectionEvent(actor, { ...account, id }, BALANCE_CORRECTION_CREATED, {
    accountId: account.id,
    date: input.date,
    amountCents,
    direction: difference > 0 ? "raise" : "lower",
    envelope: input.envelope,
    payingAccountId,
  });
  requestSync();
  return { id };
}

async function requireCorrection(correctionId: string): Promise<BalanceCorrectionRow> {
  const correction = await getBalanceCorrection(correctionId);
  if (!correction) throw new Error("That correction no longer exists.");
  return correction;
}

async function appendChange(
  actor: Actor,
  correctionId: string,
  eventType: typeof BALANCE_CORRECTION_REMOVED | typeof BALANCE_CORRECTION_RESTORED
): Promise<void> {
  const correction = await requireCorrection(correctionId);
  await appendCorrectionEvent(actor, correction, eventType, {});
  requestSync();
}

/** A correction is never edited: a wrong one is removed and the balance entered again. */
export const removeBalanceCorrection = (actor: Actor, correctionId: string) =>
  appendChange(actor, correctionId, BALANCE_CORRECTION_REMOVED);

export const restoreBalanceCorrection = (actor: Actor, correctionId: string) =>
  appendChange(actor, correctionId, BALANCE_CORRECTION_RESTORED);

export const removeBalanceCorrections = (actor: Actor, correctionIds: string[]) =>
  changeEach(
    correctionIds,
    requireCorrection,
    (correction) => correction.removed,
    (correction) => removeBalanceCorrection(actor, correction.id)
  );

export const restoreBalanceCorrections = (actor: Actor, correctionIds: string[]) =>
  changeEach(
    correctionIds,
    requireCorrection,
    (correction) => !correction.removed,
    (correction) => restoreBalanceCorrection(actor, correction.id)
  );
