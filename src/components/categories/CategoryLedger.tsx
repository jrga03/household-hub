import { format } from "date-fns";
import { Money } from "@/components/app/Money";
import { envelopeLabel } from "@/lib/allocations/envelope";
import { useBudgets, useCategoryLedger } from "@/hooks/useBudgets";
import { budgetHistory } from "@/lib/budgets/inForce";
import type { LedgerRecord, LedgerRow } from "@/lib/budgets/ledger";
import { formatPHP, type Cents } from "@/lib/currency";
import { CORRECTION_LABEL } from "@/lib/corrections/events";
import { cn } from "@/lib/utils";
import { monthLabel, parseLocalDate } from "@/lib/utils/dates";

interface Names {
  accounts: Map<string, string>;
  categories: Map<string, string>;
}

const dateOf = (date: string) => format(parseLocalDate(date), "MMM d");

const accountName = (names: Names, id: string) => names.accounts.get(id) ?? "An account";

/** What a row shows: its name and the line beneath it. */
function describe({ kind, record }: LedgerRecord, names: Names) {
  if (kind === "transaction") {
    return {
      label: record.description || (record.type === "income" ? "Income" : "Expense"),
      detail: [dateOf(record.date), accountName(names, record.accountId)].join(" · "),
    };
  }
  if (kind === "transfer") {
    const path = `${accountName(names, record.fromAccountId)} → ${accountName(names, record.toAccountId)}`;
    return {
      label: record.description || path,
      detail: [dateOf(record.date), record.description && path].filter(Boolean).join(" · "),
    };
  }
  if (kind === "correction") {
    return {
      label: CORRECTION_LABEL,
      detail: [dateOf(record.date), accountName(names, record.accountId)].join(" · "),
    };
  }
  const side = (envelope: typeof record.from) =>
    envelopeLabel(envelope, names.categories, names.accounts);
  return {
    label: `${side(record.from)} → ${side(record.to)}`,
    detail: [dateOf(record.date), accountName(names, record.accountId)].join(" · "),
  };
}

/** A signed change; a record that only moves the money between accounts shows its amount, muted. */
function Change({ row }: { row: LedgerRow }) {
  if (row.change === 0) return <Money kind="transfer" cents={row.record.amountCents} />;
  return <Money kind="net" cents={row.change} />;
}

function Balance({ label, cents }: { label: string; cents: Cents }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 text-body font-medium">
      <span>{label}</span>
      <Money kind="balance" cents={cents} />
    </div>
  );
}

/**
 * The month's transactions, transfers, allocations and balance corrections touching the category,
 * with its money before, after each and at the end, then its budget history.
 */
export function CategoryLedger({
  categoryId,
  categoryName,
  month,
  isCurrentMonth,
  names,
  onOpen,
}: {
  categoryId: string;
  categoryName: string;
  /** "yyyy-MM". */
  month: string;
  /** This month's figure in the month view counts records dated later too. */
  isCurrentMonth: boolean;
  names: Names;
  onOpen: (record: LedgerRecord) => void;
}) {
  const ledger = useCategoryLedger(categoryId, month);
  const budgets = useBudgets();
  if (!ledger || !budgets) return null;
  const versions = budgetHistory(budgets, categoryId);

  return (
    <div className="space-y-6">
      <div className="divide-y rounded-md border">
        <Balance label={`Start of ${monthLabel(month)}`} cents={ledger.opening} />
        {ledger.rows.length === 0 ? (
          <p className="px-3 py-2 text-body text-muted-foreground">
            Nothing recorded in {categoryName} this month.
          </p>
        ) : (
          <ul aria-label={`${categoryName} in ${monthLabel(month)}`} className="divide-y">
            {ledger.rows.map((row) => {
              const { label, detail } = describe(row, names);
              return (
                <li key={row.record.id}>
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    onClick={() => onOpen(row)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{label}</span>
                      <span className="block truncate text-body text-muted-foreground">
                        {detail}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end">
                      <Change row={row} />
                      <Money
                        kind="balance"
                        cents={row.balance}
                        className={cn("text-caption", row.balance >= 0 && "text-muted-foreground")}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <Balance label={`End of ${monthLabel(month)}`} cents={ledger.closing} />
        {isCurrentMonth && ledger.datedLater !== 0 && (
          <div className="flex items-center justify-between gap-3 px-3 py-2 text-body text-muted-foreground">
            <span>Dated later</span>
            <Money kind="net" cents={ledger.datedLater} />
          </div>
        )}
      </div>

      <section aria-labelledby="budget-history" className="space-y-2">
        <h3 id="budget-history" className="font-medium">
          Budget history
        </h3>
        {versions.length === 0 ? (
          <p className="text-body text-muted-foreground">No budget set yet.</p>
        ) : (
          <ul aria-label="Budget history" className="divide-y rounded-md border">
            {versions.map((version) => (
              <li
                key={version.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-body"
              >
                <span className="min-w-0">
                  <span className="block">From {monthLabel(version.fromMonth)}</span>
                  {version.accountId !== null && (
                    <span className="block truncate text-muted-foreground">
                      {accountName(names, version.accountId)}
                    </span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums">
                  {version.amountCents === null ? "Cleared" : formatPHP(version.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
