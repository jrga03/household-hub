import { useActionState, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { useAccounts, useRetiredAccounts } from "@/hooks/useAccounts";
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
  diffCents,
  formatPHP,
  formatPHPInput,
  parsePHPSafe,
  PESO_SIGN,
  sumCents,
  type Cents,
} from "@/lib/currency";
import { sameOwnership } from "@/lib/events/log";
import type { AccountMoney, Envelopes } from "@/lib/transactions/money";
import { errorMessage } from "@/lib/utils";
import { envelopeFromKey, envelopeKey, moneyIn } from "./envelopes";
import { removeAllocationWithUndo } from "./removeAllocationWithUndo";

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
 * moves out of a retired category or card but not into one, unless the
 * allocation already names it.
 */
function envelopeChoices(
  side: Side,
  account: AccountRow,
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
  const cardChoices = cards
    .filter((card) => sameOwnership(card, account))
    .map((card) => ({
      envelope: { kind: "card_payment", id: card.id } satisfies Envelope,
      label: `Card Payment · ${card.name}${card.retired ? " (retired)" : ""}`,
      retired: card.retired,
    }))
    .filter((choice) => side === "from" || !choice.retired || isCurrent(choice.envelope));

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

/** Add when `allocation` is left out; edit otherwise. */
export function MoveMoneyDialog({
  actor,
  allocation,
  onClose,
}: {
  actor: Actor;
  allocation?: AllocationRow;
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="@container max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{allocation ? "Edit move" : "Move money"}</DialogTitle>
          <DialogDescription>
            Moves money between envelopes inside one account. The balance doesn&apos;t change.
          </DialogDescription>
        </DialogHeader>
        {accountChoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add a bank, cash or e-wallet account first.
          </p>
        ) : (
          <MoveMoneyForm
            actor={actor}
            allocation={allocation}
            accounts={accountChoices}
            cards={cards}
            categories={categories}
            money={money}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

const UNCHOSEN = "";

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
  accounts,
  cards,
  categories,
  money,
  onClose,
}: {
  actor: Actor;
  allocation?: AllocationRow;
  accounts: AccountRow[];
  cards: AccountRow[];
  categories: CategoryList;
  money: Map<string, AccountMoney>;
  onClose: () => void;
}) {
  const [accountId, setAccountId] = useState(allocation?.accountId ?? accounts[0]?.id ?? "");
  const [fromKey, setFromKey] = useState(allocation ? envelopeKey(allocation.from) : "unassigned");
  const [toKey, setToKey] = useState(allocation ? envelopeKey(allocation.to) : UNCHOSEN);
  const [amountText, setAmountText] = useState(
    allocation ? formatPHPInput(allocation.amountCents) : ""
  );
  const account = accounts.find((choice) => choice.id === accountId);
  const envelopes = money.get(accountId)?.envelopes;

  const choicesFor = (side: Side) =>
    account ? envelopeChoices(side, account, categories, cards, allocation?.[side]) : [];
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
  const amount = parsePHPSafe(amountText);
  const ownMove = allocation?.accountId === accountId ? allocation : null;
  const left = from && amount.success ? moneyLeft(envelopes, from, amount.value, ownMove) : null;
  const fromLabel =
    fromChoices
      .flatMap((group) => group.choices)
      .find((choice) => from && sameEnvelope(choice.envelope, from))?.label ?? "Unassigned";

  const [error, saveAction] = useActionState(
    async (_previous: string | null, formData: FormData) => {
      const parsed = parsePHPSafe(String(formData.get("amount") ?? ""));
      if (!parsed.success) return parsed.error.message;
      const from = envelopeFromKey(String(formData.get("from") ?? ""));
      if (!from) return "Choose where the money comes from.";
      const to = envelopeFromKey(String(formData.get("to") ?? ""));
      if (!to) return "Choose where the money goes.";
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
          toast.success("Move saved");
        } else {
          await addAllocation(actor, input);
          toast.success("Money moved");
        }
        onClose();
        return null;
      } catch (caught) {
        return errorMessage(caught, "Couldn't move the money.");
      }
    },
    null
  );

  const remove = () => {
    if (!allocation) return;
    onClose();
    void removeAllocationWithUndo(actor, allocation);
  };

  return (
    <form
      action={saveAction}
      className="space-y-4"
      aria-label={allocation ? "Edit move" : "Move money"}
    >
      <div className="grid gap-4 @[480px]:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="move-amount">Amount ({PESO_SIGN})</Label>
          <Input
            id="move-amount"
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            autoComplete="off"
            required
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="move-date">Date</Label>
          <Input
            id="move-date"
            name="date"
            type="date"
            required
            defaultValue={allocation?.date ?? format(new Date(), "yyyy-MM-dd")}
          />
        </div>
        <div className="space-y-2 @[480px]:col-span-2">
          <Label htmlFor="move-account">Account</Label>
          <Select name="accountId" value={accountId} onValueChange={setAccountId}>
            <SelectTrigger id="move-account" className="w-full">
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
        </div>
        <EnvelopeSelect
          side="from"
          label="From"
          value={shownFromKey}
          onChange={setFromKey}
          groups={fromChoices}
          envelopes={envelopes}
        />
        <EnvelopeSelect
          side="to"
          label="To"
          value={shownToKey}
          onChange={setToKey}
          groups={toChoices}
          envelopes={envelopes}
        />
      </div>

      {left !== null && left < 0 && account && (
        <p className="text-sm text-destructive" aria-live="polite">
          This leaves {fromLabel} in {account.name} at {formatPHP(left)}. You can still move it; it
          shows in red until money comes in.
        </p>
      )}

      <FormError>{error}</FormError>
      <DialogFooter className="gap-2 @[480px]:justify-between">
        {allocation ? (
          <Button type="button" variant="outline" onClick={remove}>
            Remove
          </Button>
        ) : (
          <span />
        )}
        <SubmitButton pendingText="Saving...">{allocation ? "Save" : "Move money"}</SubmitButton>
      </DialogFooter>
    </form>
  );
}

function EnvelopeSelect({
  side,
  label,
  value,
  onChange,
  groups,
  envelopes,
}: {
  side: Side;
  label: string;
  value: string;
  onChange: (key: string) => void;
  groups: EnvelopeChoiceGroup[];
  envelopes: Envelopes | null | undefined;
}) {
  const amount = (envelope: Envelope) => formatPHP(moneyIn(envelopes, envelope));
  return (
    <div className="space-y-2">
      <Label htmlFor={`move-${side}`}>{label}</Label>
      <Select name={side} value={value} onValueChange={onChange}>
        <SelectTrigger id={`move-${side}`} className="w-full">
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unassigned">Unassigned · {amount({ kind: "unassigned" })}</SelectItem>
          {groups.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.choices.map((choice) => (
                <SelectItem key={envelopeKey(choice.envelope)} value={envelopeKey(choice.envelope)}>
                  {choice.label} · {amount(choice.envelope)}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
