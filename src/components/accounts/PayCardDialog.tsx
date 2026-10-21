import { useActionState, useRef, useState } from "react";
import { toast } from "sonner";
import { ActionForm } from "@/components/app/ActionForm";
import { CurrencyInput } from "@/components/app/CurrencyInput";
import { Field } from "@/components/app/Field";
import { FormError } from "@/components/app/FormError";
import { FormFooter, FormSheet } from "@/components/app/FormSheet";
import { Input } from "@/components/app/Input";
import { Money } from "@/components/app/Money";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/app/Select";
import { SubmitButton } from "@/components/app/SubmitButton";
import {
  hasFieldProblems,
  NO_PROBLEMS,
  readEntryBasics,
  useEntryFormRef,
  useFocusNewEntry,
  type EntryProblems,
} from "@/components/transactions/EntryFields";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountMoney } from "@/hooks/useTransactions";
import { payingAccountChoices } from "@/lib/accounts/paying-account";
import type { AccountRow } from "@/lib/accounts/projection";
import { cardPaymentEnvelope, UNASSIGNED_ENVELOPE } from "@/lib/allocations/events";
import type { Actor } from "@/lib/commands/accounts";
import { payCard } from "@/lib/commands/cards";
import { diffCents, formatPHP, PESO_SIGN, ZERO_CENTS, type Cents } from "@/lib/currency";
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
        <p className="pb-6 text-body text-muted-foreground">
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
  const [amount, setAmount] = useState<Cents | undefined>(
    prefilledAmount > 0 ? prefilledAmount : undefined
  );
  const payer = payers.find((choice) => choice.id === payerId);

  const [problems, payAction] = useActionState(
    async (_previous: EntryProblems, formData: FormData): Promise<EntryProblems> => {
      const { amountCents, date, fields } = readEntryBasics(formData);
      if (hasFieldProblems(fields)) return { fields, form: null };
      try {
        await payCard(actor, {
          cardId: card.id,
          fromAccountId: String(formData.get("fromAccountId") ?? ""),
          amountCents,
          date,
        });
        toast.success(`Paid ${formatPHP(amountCents)} to ${card.name}`);
        onPaid();
        return NO_PROBLEMS;
      } catch (caught) {
        return { fields: {}, form: errorMessage(caught, `Couldn't pay ${card.name}.`) };
      }
    },
    NO_PROBLEMS
  );
  const formRef = useEntryFormRef(problems);
  const amountRef = useRef<HTMLInputElement>(null);
  useFocusNewEntry(amountRef, true);

  return (
    <ActionForm
      ref={formRef}
      action={payAction}
      noValidate
      className="space-y-4"
      aria-label={`Pay ${card.name}`}
    >
      <div className="grid grid-cols-1 gap-4 @[480px]:grid-cols-2">
        <Field label={`Amount (${PESO_SIGN})`} error={problems.fields.amount}>
          <CurrencyInput
            ref={amountRef}
            name="amount"
            placeholder="0.00"
            autoComplete="off"
            enterKeyHint="done"
            required
            value={amount}
            onChange={setAmount}
          />
        </Field>
        <Field label="Date" error={problems.fields.date}>
          <Input
            name="date"
            type="date"
            required
            defaultValue={prefill?.date ?? todayLocalDate()}
          />
        </Field>
        <div className="@[480px]:col-span-2">
          <Field label="Pay from">
            {(control) => (
              <Select name="fromAccountId" value={payerId} onValueChange={setPayerId}>
                <SelectTrigger {...control} className="w-full">
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
            )}
          </Field>
        </div>
      </div>

      {payer && amount !== undefined && (
        <PaymentNote
          card={card}
          payer={payer}
          payingAccount={payingAccount}
          reserved={reserved}
          amount={amount}
          money={money}
        />
      )}

      <FormError>{problems.form}</FormError>
      <FormFooter>
        <SubmitButton pendingText="Paying…">Pay {card.name}</SubmitButton>
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
        This leaves Card Payment · {card.name} in {payer.name} at{" "}
        <Money kind="balance" cents={left} />. You can still pay; it shows in red until money comes
        in.
      </p>
    );
  }
  const freed = reservationFreed(reserved, amount);
  const left = diffCents(moneyIn(money.get(payer.id)?.envelopes, UNASSIGNED_ENVELOPE), amount);
  return (
    <div className="space-y-1 text-body" aria-live="polite">
      {payingAccount && freed > 0 && (
        <p className="text-muted-foreground">
          <Money kind="balance" cents={freed} /> set aside in {payingAccount.name} goes back to its
          Unassigned.
        </p>
      )}
      {left < 0 && (
        <p className="text-shortfall">
          This leaves {payer.name}&apos;s Unassigned at <Money kind="balance" cents={left} />. You
          can still pay; it shows in red until money comes in.
        </p>
      )}
    </div>
  );
}
