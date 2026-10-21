import { useActionState, useState } from "react";
import { toast } from "sonner";
import { ActionForm } from "@/components/ui/action-form";
import { advanceOnEnter, FormFooter, FormSheet } from "@/components/app/FormSheet";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountMoney } from "@/hooks/useTransactions";
import { payingAccountChoices } from "@/lib/accounts/paying-account";
import type { AccountRow } from "@/lib/accounts/projection";
import { cardPaymentEnvelope, UNASSIGNED_ENVELOPE } from "@/lib/allocations/events";
import type { Actor } from "@/lib/commands/accounts";
import { payCard } from "@/lib/commands/cards";
import {
  diffCents,
  formatPHP,
  formatPHPInput,
  parsePHPSafe,
  PESO_SIGN,
  ZERO_CENTS,
  type Cents,
} from "@/lib/currency";
import { moneyIn, reservationFreed, type AccountMoney } from "@/lib/transactions/money";
import { errorMessage } from "@/lib/utils";
import { todayLocalDate } from "@/lib/utils/dates";

/** A payment read from a statement, to record as it was made. */
export interface PaymentPrefill {
  amountCents: Cents;
  date: string;
}

/**
 * Prefilled with what the card's Paying Account holds for it, today, and that
 * account, or with a statement's payment line.
 */
export function PayCardDialog({
  actor,
  card,
  prefill,
  onPaid,
  onClose,
}: {
  actor: Actor;
  card: AccountRow;
  prefill?: PaymentPrefill;
  onPaid?: () => void;
  onClose: () => void;
}) {
  const accounts = useAccounts();
  const money = useAccountMoney();
  if (!accounts || !money) return null;
  const payers = payingAccountChoices(accounts, card);

  return (
    <FormSheet
      title={`Pay ${card.name}`}
      description={`A transfer from the Card Payment set aside for ${card.name}.`}
      onClose={onClose}
    >
      {payers.length === 0 ? (
        <p className="text-body text-muted-foreground">
          Add a bank, cash or e-wallet account seen by the same people as {card.name} first.
        </p>
      ) : (
        <PayCardForm
          actor={actor}
          card={card}
          payers={payers}
          money={money}
          prefill={prefill}
          onPaid={() => {
            onPaid?.();
            onClose();
          }}
        />
      )}
    </FormSheet>
  );
}

const cardPaymentIn = (money: Map<string, AccountMoney>, accountId: string, card: AccountRow) =>
  moneyIn(money.get(accountId)?.envelopes, cardPaymentEnvelope(card.id));

function PayCardForm({
  actor,
  card,
  payers,
  money,
  prefill,
  onPaid,
}: {
  actor: Actor;
  card: AccountRow;
  payers: AccountRow[];
  money: Map<string, AccountMoney>;
  prefill: PaymentPrefill | undefined;
  onPaid: () => void;
}) {
  const payingAccount = payers.find((payer) => payer.id === card.payingAccountId);
  const reserved = payingAccount ? cardPaymentIn(money, payingAccount.id, card) : ZERO_CENTS;
  const [payerId, setPayerId] = useState(payingAccount?.id ?? payers[0]?.id ?? "");
  const prefilledAmount = prefill?.amountCents ?? reserved;
  const [amountText, setAmountText] = useState(
    prefilledAmount > 0 ? formatPHPInput(prefilledAmount) : ""
  );
  const payer = payers.find((choice) => choice.id === payerId);
  const amount = parsePHPSafe(amountText);

  const [error, payAction] = useActionState(
    async (_previous: string | null, formData: FormData) => {
      const parsed = parsePHPSafe(String(formData.get("amount") ?? ""));
      if (!parsed.success) return parsed.error.message;
      try {
        await payCard(actor, {
          cardId: card.id,
          fromAccountId: String(formData.get("fromAccountId") ?? ""),
          amountCents: parsed.value,
          date: String(formData.get("date") ?? ""),
        });
        toast.success(`Paid ${formatPHP(parsed.value)} to ${card.name}`);
        onPaid();
        return null;
      } catch (caught) {
        return errorMessage(caught, `Couldn't pay ${card.name}.`);
      }
    },
    null
  );

  return (
    <ActionForm
      ref={advanceOnEnter}
      action={payAction}
      className="space-y-4"
      aria-label={`Pay ${card.name}`}
    >
      <div className="grid grid-cols-1 gap-4 @[480px]:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pay-amount">Amount ({PESO_SIGN})</Label>
          <Input
            id="pay-amount"
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            autoComplete="off"
            enterKeyHint="done"
            required
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pay-date">Date</Label>
          <Input
            id="pay-date"
            name="date"
            type="date"
            required
            defaultValue={prefill?.date ?? todayLocalDate()}
          />
        </div>
        <div className="space-y-2 @[480px]:col-span-2">
          <Label htmlFor="pay-from">Pay from</Label>
          <Select name="fromAccountId" value={payerId} onValueChange={setPayerId}>
            <SelectTrigger id="pay-from" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {payers.map((choice) => (
                <SelectItem key={choice.id} value={choice.id}>
                  {choice.name}
                  {choice.id === card.payingAccountId && " (Paying Account)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {payer && amount.success && (
        <PaymentNote
          card={card}
          payer={payer}
          payingAccount={payingAccount}
          reserved={reserved}
          amount={amount.value}
          money={money}
        />
      )}

      <FormError>{error}</FormError>
      <FormFooter>
        <SubmitButton pendingText="Paying...">Pay {card.name}</SubmitButton>
      </FormFooter>
    </ActionForm>
  );
}

/** What the payment draws, and how much reservation goes back, warning (not blocking) below zero. */
function PaymentNote({
  card,
  payer,
  payingAccount,
  reserved,
  amount,
  money,
}: {
  card: AccountRow;
  payer: AccountRow;
  payingAccount: AccountRow | undefined;
  reserved: Cents;
  amount: Cents;
  money: Map<string, AccountMoney>;
}) {
  if (payer.id === payingAccount?.id) {
    const left = diffCents(reserved, amount);
    if (left >= 0) return null;
    return (
      <p className="text-body text-shortfall" aria-live="polite">
        This leaves Card Payment · {card.name} in {payer.name} at {formatPHP(left)}. You can still
        pay; it shows in red until money comes in.
      </p>
    );
  }
  const freed = reservationFreed(reserved, amount);
  const left = diffCents(moneyIn(money.get(payer.id)?.envelopes, UNASSIGNED_ENVELOPE), amount);
  return (
    <div className="space-y-1 text-body" aria-live="polite">
      {payingAccount && freed > 0 && (
        <p className="text-muted-foreground">
          {formatPHP(freed)} set aside in {payingAccount.name} goes back to its Unassigned.
        </p>
      )}
      {left < 0 && (
        <p className="text-shortfall">
          This leaves {payer.name}&apos;s Unassigned at {formatPHP(left)}. You can still pay; it
          shows in red until money comes in.
        </p>
      )}
    </div>
  );
}
