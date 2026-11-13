import { EmptyState } from "@/components/app/EmptyState";
import { Money } from "@/components/app/Money";
import { SectionHeader } from "@/components/app/SectionHeader";
import type { Budget } from "@/lib/budgets/inForce";
import { paydayPlan } from "@/lib/budgets/paydayPlan";
import type { PaydayRow } from "@/lib/paydays/projection";

/** What each payday pays this month and how much goes to each funding account (ADR 0014). */
export function PaydayPlan({
  paydays,
  budgets,
  categoryNames,
  accountNames,
}: {
  paydays: PaydayRow[];
  /** This month's budgets by category ID, in the order to list them. */
  budgets: [categoryId: string, budget: Budget][];
  categoryNames: Map<string, string>;
  accountNames: Map<string, string>;
}) {
  // shortcut: a portion on a payday deleted on another device shows nowhere; #448 brings it back as retired.
  const sections = paydayPlan(
    paydays.map((payday) => payday.id),
    budgets
  );
  const paydayName = (paydayId: string | null) =>
    paydays.find((payday) => payday.id === paydayId)?.name ?? "Any payday";

  return (
    <section aria-labelledby="payday-plan-heading" className="space-y-6">
      <SectionHeader title={<span id="payday-plan-heading">By payday</span>} />
      {sections.map(({ paydayId, lines, total, byAccount }) => {
        const name = paydayName(paydayId);
        return (
          <section key={paydayId ?? "any"} aria-label={name} className="space-y-2">
            <SectionHeader level={3} title={name} action={<Money kind="balance" cents={total} />} />
            {lines.length === 0 ? (
              <EmptyState className="py-0">No budgets.</EmptyState>
            ) : (
              <>
                <ul aria-label={`${name} budgets`} className="divide-y border-y">
                  {lines.map((line) => (
                    <li
                      key={line.categoryId}
                      className="flex items-center justify-between gap-3 px-4 py-2 text-body"
                    >
                      <span className="min-w-0 truncate">{categoryNames.get(line.categoryId)}</span>
                      <Money kind="balance" cents={line.amountCents} />
                    </li>
                  ))}
                </ul>
                <ul aria-label={`${name} by account`}>
                  {[...byAccount].map(([accountId, cents]) => (
                    <li
                      key={accountId}
                      className="flex items-center justify-between gap-3 px-4 py-1 text-body text-muted-foreground"
                    >
                      <span className="min-w-0 truncate">To {accountNames.get(accountId)}</span>
                      <Money kind="balance" cents={cents} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        );
      })}
    </section>
  );
}
