import { useActionState, useState } from "react";
import { toast } from "sonner";
import { ActionForm } from "@/components/app/ActionForm";
import { CurrencyInput } from "@/components/app/CurrencyInput";
import { Field } from "@/components/app/Field";
import { FormFooter, FormSheet, FULL_ROW } from "@/components/app/FormSheet";
import { FormError } from "@/components/app/FormError";
import { Input } from "@/components/app/Input";
import { Money } from "@/components/app/Money";
import { Notice } from "@/components/app/Notice";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/app/Select";
import { SubmitButton } from "@/components/app/SubmitButton";
import { useAccounts, useRetiredAccounts } from "@/hooks/useAccounts";
import { useFocusFirstProblem } from "@/hooks/useFocusFirstProblem";
import { useCategoryList } from "@/hooks/useCategories";
import { useAccountMoney } from "@/hooks/useTransactions";
import { isCreditCard } from "@/lib/accounts/events";
import type { AccountRow } from "@/lib/accounts/projection";
import { sameEnvelope, type Envelope } from "@/lib/allocations/events";
import type { AllocationRow } from "@/lib/allocations/projection";
import { canHoldMoneyIn, type CategoryList, type CategoryRow } from "@/lib/categories/projection";
import type { Actor } from "@/lib/commands/accounts";
import { addAllocation, editAllocation, type AllocationInput } from "@/lib/commands/allocations";
import {
  AMOUNT_PROBLEM,
  diffCents,
  isAmount,
  parsePHPSafe,
  PESO_SIGN,
  sumCents,
  type Cents,
} from "@/lib/currency";
import { sameOwnership } from "@/lib/events/ownership";
import { moneyIn, type AccountMoney, type Envelopes } from "@/lib/transactions/money";
import { errorMessage } from "@/lib/utils";
import { envelopeFromKey, envelopeKey } from "./envelopes";
import { removeAllocationWithUndo } from "./removeAllocationWithUndo";
import { todayLocalDate } from "@/lib/utils/dates";

interface EnvelopeChoice {
  envelope: Envelope;
  label: string;
}

interface EnvelopeChoiceGroup {
  label: string;
  choices: EnvelopeChoice[];
}

type Side = "from" | "to";

/**
 * The account's Card Payments and the categories that fit it, by group. Money
 * goes into the Card Payment of a card in use paid from this account, and
 * comes out of any card's Card Payment still holding money here. It moves out
 * of a retired category but not into one. The allocation's own choice stays.
 */
function envelopeChoices(
  side: Side,
  account: AccountRow,
  envelopes: Envelopes | null | undefined,
  categories: CategoryList,
  cards: AccountRow[],
  current: Envelope | undefined
): EnvelopeChoiceGroup[] {
  const isCurrent = (envelope: Envelope) =>
    current !== undefined && sameEnvelope(current, envelope);
  const categoryChoice = (category: CategoryRow): EnvelopeChoice => ({
    envelope: { kind: "category", id: category.id },
    label: category.name,
  });
  const fits = (category: CategoryRow) => canHoldMoneyIn(category, account);
  const retiredChoices = categories.retiredCategories
    .filter(fits)
    .map(categoryChoice)
    .filter((choice) => side === "from" || isCurrent(choice.envelope));
  const takesMoney = (card: AccountRow) => card.payingAccountId === account.id && !card.retired;
  const cardChoices = cards
    .filter((card) => sameOwnership(card, account))
    .map((card) => ({
      card,
      envelope: { kind: "card_payment", id: card.id } satisfies Envelope,
      label: `Card Payment · ${card.name}${card.retired ? " (retired)" : ""}`,
    }))
    .filter(
      ({ card, envelope }) =>
        takesMoney(card) ||
        isCurrent(envelope) ||
        (side === "from" && moneyIn(envelopes, envelope) !== 0)
    );

  const groups = [
    { label: "Card Payments", choices: cardChoices },
    ...categories.groups.map((group) => ({
      label: group.name,
      choices: group.categories.filter(fits).map(categoryChoice),
    })),
    { label: "Ungrouped", choices: categories.ungrouped.filter(fits).map(categoryChoice) },
    { label: "Retired", choices: retiredChoices },
  ];
  return groups.filter((group) => group.choices.length > 0);
}

/** Add when `allocation` is left out, into `toCategory` when given; edit otherwise. */
export function MoveMoneyDialog({
  actor,
  allocation,
  toCategory,
  onClose,
}: {
  actor: Actor;
  allocation?: AllocationRow;
  toCategory?: CategoryRow;
  onClose: () => void;
}) {
  const accounts = useAccounts();
  const retiredAccounts = useRetiredAccounts();
  const categories = useCategoryList();
  const money = useAccountMoney();
  if (!accounts || !retiredAccounts || !categories || !money) return null;

  const holdsEnvelopes = (account: AccountRow) => !isCreditCard(account);
  // An allocation moves only within its visibility; its own account stays a choice even when retired.
  const accountChoices = allocation
    ? [
        ...accounts.filter((account) => sameOwnership(account, allocation)),
        ...retiredAccounts.filter((account) => account.id === allocation.accountId),
      ].filter(holdsEnvelopes)
    : accounts.filter(holdsEnvelopes);
  const cards = [...accounts, ...retiredAccounts].filter(isCreditCard);

  return (
    <FormSheet
      title={allocation ? "Edit allocation" : "Move money"}
      description="Moves money between categories, Card Payments and Unassigned inside one account. The balance doesn't change."
      onClose={onClose}
    >
      {accountChoices.length === 0 ? (
        <p className="text-body text-muted-foreground">
          Add a bank, cash or e-wallet account first.
        </p>
      ) : (
        <MoveMoneyForm
          actor={actor}
          allocation={allocation}
          toCategory={toCategory}
          accounts={accountChoices}
          cards={cards}
          categories={categories}
          money={money}
          onClose={onClose}
        />
      )}
    </FormSheet>
  );
}

const UNCHOSEN = "";

type MoveProblems = Partial<Record<"amount" | "from" | "to" | "form", string>>;

const NO_PROBLEMS: MoveProblems = {};

/**
 * What the source envelope would hold after this move. An edit's own earlier
 * move is taken back first, so changing ₱8,000 to ₱9,000 checks the ₱1,000 more.
 */
function moneyLeft(
  envelopes: Envelopes | null | undefined,
  from: Envelope,
  amount: Cents,
  ownMove: AllocationRow | null
): Cents {
  let held = moneyIn(envelopes, from);
  if (ownMove && sameEnvelope(ownMove.from, from)) held = sumCents([held, ownMove.amountCents]);
  if (ownMove && sameEnvelope(ownMove.to, from)) held = diffCents(held, ownMove.amountCents);
  return diffCents(held, amount);
}

function MoveMoneyForm({
  actor,
  allocation,
  toCategory,
  accounts,
  cards,
  categories,
  money,
  onClose,
}: {
  actor: Actor;
  allocation?: AllocationRow;
  toCategory?: CategoryRow;
  accounts: AccountRow[];
  cards: AccountRow[];
  categories: CategoryList;
  money: Map<string, AccountMoney>;
  onClose: () => void;
}) {
  const holdsToCategory = (account: AccountRow) =>
    toCategory !== undefined && canHoldMoneyIn(toCategory, account);
  const [accountId, setAccountId] = useState(
    allocation?.accountId ?? (accounts.find(holdsToCategory) ?? accounts[0])?.id ?? ""
  );
  const [fromKey, setFromKey] = useState(allocation ? envelopeKey(allocation.from) : "unassigned");
  const [toKey, setToKey] = useState(() => {
    if (allocation) return envelopeKey(allocation.to);
    return toCategory ? envelopeKey({ kind: "category", id: toCategory.id }) : UNCHOSEN;
  });
  const [amount, setAmount] = useState<Cents | undefined>(allocation?.amountCents);
  const account = accounts.find((choice) => choice.id === accountId);
  const envelopes = money.get(accountId)?.envelopes;

  const choicesFor = (side: Side) =>
    account ? envelopeChoices(side, account, envelopes, categories, cards, allocation?.[side]) : [];
  const fromChoices = choicesFor("from");
  const toChoices = choicesFor("to");
  // A category or card of another visibility can't follow the account change.
  const shownKey = (key: string, groups: EnvelopeChoiceGroup[], fallback: string) =>
    key === "unassigned" ||
    groups.some((group) => group.choices.some((choice) => envelopeKey(choice.envelope) === key))
      ? key
      : fallback;
  const shownFromKey = shownKey(fromKey, fromChoices, "unassigned");
  const shownToKey = shownKey(toKey, toChoices, UNCHOSEN);

  const from = envelopeFromKey(shownFromKey);
  const ownMove = allocation?.accountId === accountId ? allocation : null;
  const left = from && amount !== undefined ? moneyLeft(envelopes, from, amount, ownMove) : null;
  const fromLabel =
    fromChoices
      .flatMap((group) => group.choices)
      .find((choice) => from && sameEnvelope(choice.envelope, from))?.label ?? "Unassigned";

  const [problems, saveAction] = useActionState(
    async (_previous: MoveProblems, formData: FormData): Promise<MoveProblems> => {
      const parsed = parsePHPSafe(String(formData.get("amount") ?? ""));
      if (!parsed.success) return { amount: parsed.error.message };
      if (!isAmount(parsed.value)) return { amount: AMOUNT_PROBLEM };
      const from = envelopeFromKey(String(formData.get("from") ?? ""));
      if (!from) return { from: "Choose where the money comes from." };
      const to = envelopeFromKey(String(formData.get("to") ?? ""));
      if (!to) return { to: "Choose where the money goes." };
      const input: AllocationInput = {
        date: String(formData.get("date") ?? ""),
        accountId: String(formData.get("accountId") ?? ""),
        from,
        to,
        amountCents: parsed.value,
      };
      try {
        if (allocation) {
          await editAllocation(actor, allocation.id, input);
          toast.success("Allocation saved");
        } else {
          await addAllocation(actor, input);
          toast.success("Money moved");
        }
        onClose();
        return NO_PROBLEMS;
      } catch (caught) {
        return { form: errorMessage(caught, "Couldn't move the money.") };
      }
    },
    NO_PROBLEMS
  );

  const formRef = useFocusFirstProblem(problems);

  const remove = () => {
    if (!allocation) return;
    onClose();
    void removeAllocationWithUndo(actor, allocation);
  };

  return (
    <ActionForm
      ref={formRef}
      action={saveAction}
      noValidate
      className="space-y-4"
      aria-label={allocation ? "Edit allocation" : "Move money"}
    >
      <div className="grid grid-cols-1 gap-4 @[480px]:grid-cols-2">
        <Field label={`Amount (${PESO_SIGN})`} error={problems.amount}>
          <CurrencyInput
            name="amount"
            placeholder="0.00"
            autoComplete="off"
            enterKeyHint="done"
            value={amount}
            onChange={setAmount}
          />
        </Field>
        <Field label="Date">
          <Input
            name="date"
            type="date"
            required
            defaultValue={allocation?.date ?? todayLocalDate()}
          />
        </Field>
        <div className={FULL_ROW}>
          <Field label="Account">
            {(control) => (
              <Select name="accountId" value={accountId} onValueChange={setAccountId}>
                <SelectTrigger {...control} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((choice) => (
                    <SelectItem key={choice.id} value={choice.id}>
                      {choice.name}
                      {choice.visibility === "personal" && " (Personal)"}
                      {choice.retired && " (retired)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        </div>
        <EnvelopeSelect
          side="from"
          label="From"
          value={shownFromKey}
          onChange={setFromKey}
          groups={fromChoices}
          envelopes={envelopes}
          error={problems.from}
        />
        <EnvelopeSelect
          side="to"
          label="To"
          value={shownToKey}
          onChange={setToKey}
          groups={toChoices}
          envelopes={envelopes}
          error={problems.to}
        />
      </div>

      <div aria-live="polite">
        {left !== null && left < 0 && account && (
          <Notice tone="warning">
            This leaves {fromLabel} in {account.name} at <Money kind="balance" cents={left} />. You
            can still move it; it shows in red until money comes in.
          </Notice>
        )}
      </div>

      <FormError>{problems.form ?? null}</FormError>
      <FormFooter destructive={allocation && { label: "Remove", onClick: remove }}>
        <SubmitButton pendingText="Saving…">{allocation ? "Save" : "Move money"}</SubmitButton>
      </FormFooter>
    </ActionForm>
  );
}

function EnvelopeSelect({
  side,
  label,
  value,
  onChange,
  groups,
  envelopes,
  error,
}: {
  side: Side;
  label: string;
  value: string;
  onChange: (key: string) => void;
  groups: EnvelopeChoiceGroup[];
  envelopes: Envelopes | null | undefined;
  error?: string;
}) {
  const amount = (envelope: Envelope) => (
    <Money kind="balance" cents={moneyIn(envelopes, envelope)} />
  );
  return (
    <Field label={label} error={error}>
      {(control) => (
        <Select name={side} value={value} onValueChange={onChange}>
          <SelectTrigger {...control} className="w-full">
            <SelectValue placeholder="Choose" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">
              Unassigned · {amount({ kind: "unassigned" })}
            </SelectItem>
            {groups.map((group) => (
              <SelectGroup key={group.label}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.choices.map((choice) => (
                  <SelectItem
                    key={envelopeKey(choice.envelope)}
                    value={envelopeKey(choice.envelope)}
                  >
                    {choice.label} · {amount(choice.envelope)}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}
