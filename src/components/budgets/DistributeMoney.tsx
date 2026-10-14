import { Link } from "@tanstack/react-router";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { categoryNames } from "@/components/allocations/envelopes";
import { advanceOnEnter, FormFooter } from "@/components/FormSheet";
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
import { useDistributeLines } from "@/hooks/useBudgets";
import { useCategoryList } from "@/hooks/useCategories";
import { useAccountMoney } from "@/hooks/useTransactions";
import { isCreditCard } from "@/lib/accounts/events";
import type { AccountRow } from "@/lib/accounts/projection";
import {
  canReceive,
  categoriesHeldBy,
  type DistributeLine,
  type DistributeMode,
} from "@/lib/budgets/distribute";
import {
  hasHouseholdGroup,
  type CategoryList,
  type CategoryRow,
} from "@/lib/categories/projection";
import type { Actor } from "@/lib/commands/accounts";
import { distributeMoney, type DistributeLineInput } from "@/lib/commands/distribute";
import {
  diffCents,
  formatPHP,
  formatPHPInput,
  parsePHPSafe,
  PESO_SIGN,
  sumCents,
  ZERO_CENTS,
  type Cents,
} from "@/lib/currency";
import { isLocalDate } from "@/lib/transactions/events";
import { errorMessage } from "@/lib/utils";
import { localMonth, monthOfDate } from "@/lib/utils/dates";

interface Props {
  actor: Actor;
  mode: DistributeMode;
  initialAccountId?: string;
  initialAmount?: string;
  initialDate: string;
  onDone: () => void;
}

export function DistributeMoney(props: Props) {
  const accounts = useAccounts();
  const categories = useCategoryList();
  const money = useAccountMoney();
  if (!accounts || !categories || !money) return null;

  const sources = accounts.filter((account) => !isCreditCard(account));
  if (sources.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Add a bank, cash or e-wallet account first.</p>
    );
  }
  return (
    <DistributeForm
      {...props}
      sources={sources}
      accounts={accounts}
      categories={categories}
      unassignedIn={(accountId) => money.get(accountId)?.envelopes?.unassigned ?? ZERO_CENTS}
    />
  );
}

function DistributeForm({
  actor,
  mode,
  initialAccountId,
  initialAmount,
  initialDate,
  onDone,
  sources,
  accounts,
  categories,
  unassignedIn,
}: Props & {
  sources: AccountRow[];
  accounts: AccountRow[];
  categories: CategoryList;
  unassignedIn: (accountId: string) => Cents;
}) {
  const [sourceId, setSourceId] = useState(
    sources.find((account) => account.id === initialAccountId)?.id ?? sources[0]?.id ?? ""
  );
  const [date, setDate] = useState(initialDate);
  const [amountText, setAmountText] = useState(initialAmount ?? "");
  const source = sources.find((account) => account.id === sourceId);
  const month = isLocalDate(date) ? monthOfDate(date) : localMonth(new Date());
  const lines = useDistributeLines(sourceId, month, mode);
  const holdsCategories = source !== undefined && categoriesHeldBy(categories, source).length > 0;

  const unassigned = unassignedIn(sourceId);
  const income = parsePHPSafe(amountText);
  const available =
    mode === "income" && income.success
      ? { cents: income.value, label: "this income" }
      : { cents: unassigned, label: `${source?.name ?? "the account"}'s Unassigned` };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 @[480px]:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="distribute-source">From</Label>
          <Select value={sourceId} onValueChange={setSourceId}>
            <SelectTrigger id="distribute-source" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sources.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                  {account.visibility === "personal" && " (Personal)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Unassigned: {formatPHP(unassigned)}</p>
        </div>
        {mode === "income" && (
          <div className="space-y-2">
            <Label htmlFor="distribute-amount">Income ({PESO_SIGN})</Label>
            <Input
              id="distribute-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder={formatPHPInput(unassigned) || "0.00"}
              enterKeyHint="done"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="distribute-date">Date</Label>
          <Input
            id="distribute-date"
            type="date"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
      </div>

      {source && !holdsCategories && (
        <NoCategories source={source} offerSuggested={!hasHouseholdGroup(categories)} />
      )}
      {source && lines && holdsCategories && (
        // Edits reset only when the source or month changes the lines themselves.
        <LinesForm
          key={`${source.id}:${month}`}
          actor={actor}
          source={source}
          date={date}
          initialLines={lines}
          accounts={accounts}
          categories={categories}
          available={available}
          onDone={onDone}
        />
      )}
    </div>
  );
}

/** The suggested set is household-only, and Categories offers it only while no household group exists. */
function NoCategories({ source, offerSuggested }: { source: AccountRow; offerSuggested: boolean }) {
  const categoriesLink = <Link to="/categories">Categories</Link>;
  return (
    <p className="text-sm text-muted-foreground">
      {source.name} has no categories yet.{" "}
      {source.visibility === "personal" ? (
        <>Add a personal category on {categoriesLink}.</>
      ) : offerSuggested ? (
        <>
          On {categoriesLink}, &quot;Use suggested categories&quot; sets up a starter set, or add
          your own.
        </>
      ) : (
        <>Add a household category on {categoriesLink}.</>
      )}
    </p>
  );
}

interface LineDraft {
  categoryId: string;
  accountId: string;
  amountText: string;
  budgetCents: Cents | null;
  fundingAccountRetired: boolean;
}

const toDraft = (line: DistributeLine): LineDraft => ({
  categoryId: line.categoryId,
  accountId: line.accountId,
  amountText: line.amountCents === null ? "" : formatPHPInput(line.amountCents),
  budgetCents: line.budgetCents,
  fundingAccountRetired: line.fundingAccountRetired,
});

/** A blank line's amount is zero; text that isn't an amount is null. */
function lineAmount(line: LineDraft): Cents | null {
  if (line.amountText.trim() === "") return ZERO_CENTS;
  const parsed = parsePHPSafe(line.amountText);
  return parsed.success ? parsed.value : null;
}

function LinesForm({
  actor,
  source,
  date,
  initialLines,
  accounts,
  categories,
  available,
  onDone,
}: {
  actor: Actor;
  source: AccountRow;
  date: string;
  initialLines: DistributeLine[];
  accounts: AccountRow[];
  categories: CategoryList;
  available: { cents: Cents; label: string };
  onDone: () => void;
}) {
  const [lines, setLines] = useState(() => initialLines.map(toDraft));
  const names = categoryNames(categories);
  const destinations = accounts.filter((account) => canReceive(account, source));
  const unlisted = categoriesHeldBy(categories, source).filter(
    (category) => !lines.some((line) => line.categoryId === category.id)
  );

  const change = (categoryId: string, update: Partial<LineDraft>) =>
    setLines((current) =>
      current.map((line) => (line.categoryId === categoryId ? { ...line, ...update } : line))
    );
  // A category added by hand has no budget this month, or it would already be listed.
  const addLine = (category: CategoryRow) =>
    setLines((current) => [
      ...current,
      toDraft({
        categoryId: category.id,
        accountId: source.id,
        amountCents: null,
        budgetCents: null,
        fundingAccountRetired: false,
      }),
    ]);

  const total = sumCents(lines.map((line) => lineAmount(line) ?? ZERO_CENTS));
  const left = diffCents(available.cents, total);

  const [error, submit] = useActionState(async () => {
    const funded: DistributeLineInput[] = [];
    for (const line of lines) {
      const amountCents = lineAmount(line);
      const name = names.get(line.categoryId) ?? "a category";
      if (amountCents === null) return `Check the amount for ${name}.`;
      funded.push({ categoryId: line.categoryId, accountId: line.accountId, amountCents });
    }
    try {
      await distributeMoney(actor, { sourceAccountId: source.id, date, lines: funded });
    } catch (caught) {
      return errorMessage(caught, "Couldn't distribute the money.");
    }
    toast.success("Money distributed");
    onDone();
    return null;
  }, null);

  return (
    <form ref={advanceOnEnter} action={submit} aria-label="Distribute money" className="space-y-4">
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No budgets this month for {source.name}&apos;s categories. Add a category below.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {lines.map((line) => (
            <DistributeLineRow
              key={line.categoryId}
              line={line}
              name={names.get(line.categoryId) ?? "Category"}
              destinations={destinations}
              onChange={(update) => change(line.categoryId, update)}
            />
          ))}
        </ul>
      )}

      {unlisted.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="distribute-add">Add a category</Label>
          <Select
            value=""
            onValueChange={(categoryId) => {
              const category = unlisted.find((choice) => choice.id === categoryId);
              if (category) addLine(category);
            }}
          >
            <SelectTrigger id="distribute-add" className="w-full @[480px]:w-64">
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              {unlisted.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1 text-sm" aria-live="polite">
        <p>
          Distributing <span className="font-medium tabular-nums">{formatPHP(total)}</span>
        </p>
        {left < 0 ? (
          <p className="text-destructive">
            {formatPHP(diffCents(total, available.cents))} more than {available.label}. You can
            still distribute it; trim a line or Unassigned shows in red.
          </p>
        ) : (
          <p className="text-muted-foreground">{formatPHP(left)} stays in Unassigned</p>
        )}
      </div>

      <FormError>{error}</FormError>
      <FormFooter>
        <SubmitButton pendingText="Distributing...">Distribute</SubmitButton>
      </FormFooter>
    </form>
  );
}

function DistributeLineRow({
  line,
  name,
  destinations,
  onChange,
}: {
  line: LineDraft;
  name: string;
  destinations: AccountRow[];
  onChange: (update: Partial<LineDraft>) => void;
}) {
  const amountId = `distribute-${line.categoryId}-amount`;
  return (
    <li className="@container px-4 py-3">
      <div className="grid grid-cols-1 gap-2 @[560px]:grid-cols-[minmax(0,1fr)_9rem_11rem] @[560px]:items-center">
        <div>
          <Label htmlFor={amountId} className="font-medium">
            {name}
          </Label>
          <p className="text-xs text-muted-foreground">
            {line.budgetCents === null ? "No budget" : `Budget ${formatPHP(line.budgetCents)}`}
            {line.fundingAccountRetired && " · Funding account retired"}
          </p>
        </div>
        <Input
          id={amountId}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          enterKeyHint="next"
          value={line.amountText}
          onChange={(event) => onChange({ amountText: event.target.value })}
        />
        <Select value={line.accountId} onValueChange={(accountId) => onChange({ accountId })}>
          <SelectTrigger aria-label={`${name} goes to`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {destinations.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </li>
  );
}
