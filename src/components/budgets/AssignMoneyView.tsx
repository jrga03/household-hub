import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { PayCardDialog } from "@/components/accounts/PayCardDialog";
import { AllocationList } from "@/components/allocations/AllocationList";
import { categoryNames, namedAmounts } from "@/components/allocations/envelopes";
import { NegativeNote, OVERDRAWN_UNASSIGNED } from "@/components/allocations/NegativeNote";
import { MoveMoneyDialog } from "@/components/allocations/MoveMoneyDialog";
import { Button } from "@/components/app/Button";
import { EmptyState } from "@/components/app/EmptyState";
import { FormSheet } from "@/components/app/FormSheet";
import { HeroFigure } from "@/components/app/HeroFigure";
import { Money } from "@/components/app/Money";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/app/Popover";
import { StatusBadge } from "@/components/app/StatusBadge";
import { PageShell } from "@/components/layout/PageShell";
import { useAccountNames, useAccounts, useRetiredAccounts } from "@/hooks/useAccounts";
import { useCategoryList } from "@/hooks/useCategories";
import { useCloseWhenGone } from "@/hooks/useCloseWhenGone";
import { useAccountMoney } from "@/hooks/useTransactions";
import { isCreditCard } from "@/lib/accounts/events";
import type { AccountRow } from "@/lib/accounts/projection";
import type { AllocationRow } from "@/lib/allocations/projection";
import type { DistributeMode } from "@/lib/budgets/distribute";
import type { Actor } from "@/lib/commands/accounts";
import { sumCents, ZERO_CENTS } from "@/lib/currency";
import type { AccountMoney } from "@/lib/transactions/money";
import { cn } from "@/lib/utils";
import { todayLocalDate } from "@/lib/utils/dates";
import { DistributeMoney } from "./DistributeMoney";

/** Opened from the route's search, so a payday toast or the checklist can link straight to it. */
export interface DistributeRequest {
  mode: DistributeMode;
  accountId?: string;
  amount?: string;
  date?: string;
}

/** Where Unassigned money is given a job, with Move money and Distribute. */
export function AssignMoneyView({
  actor,
  distribute,
  onDistribute,
}: {
  actor: Actor;
  distribute: DistributeRequest | null;
  onDistribute: (mode: DistributeMode | null) => void;
}) {
  const list = useCategoryList();
  const accountNames = useAccountNames();
  const [moving, setMoving] = useState<AllocationRow | "new" | null>(null);

  if (!list || !accountNames) return null;

  return (
    <PageShell.Main className="space-y-8">
      <UnassignedMoney
        actor={actor}
        accountNames={accountNames}
        onDistribute={() => onDistribute("income")}
        onMove={() => setMoving("new")}
      />

      <AllocationList
        categoryNames={categoryNames(list)}
        accountNames={accountNames}
        onEdit={setMoving}
      />

      {moving && (
        <MoveMoneyDialog
          actor={actor}
          allocation={moving === "new" ? undefined : moving}
          onClose={() => setMoving(null)}
        />
      )}
      {distribute && (
        <FormSheet
          title="Distribute money"
          description={
            distribute.mode === "opening"
              ? "Split a starting balance across its categories."
              : "Split income across the budgets."
          }
          onClose={() => onDistribute(null)}
          openInUrl
        >
          <DistributeMoney
            actor={actor}
            mode={distribute.mode}
            initialAccountId={distribute.accountId}
            initialAmount={distribute.amount}
            initialDate={distribute.date ?? todayLocalDate()}
            onDone={() => onDistribute(null)}
          />
        </FormSheet>
      )}
    </PageShell.Main>
  );
}

/** What Unassigned, Move money and Distribute mean, beside the screen's title. */
export function AssignMoneyHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="About assigning money">
          <Info />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="space-y-2 text-body">
        <p>Unassigned is money in your accounts not yet in a category.</p>
        <p>Move money moves it between categories.</p>
        <p>Distribute shares income across categories by their budgets.</p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The money not yet in a category, where Distribute and Move money start,
 * with each account's Unassigned and Card Payments beneath. A retired account
 * still holding money stays listed until it's moved out.
 */
function UnassignedMoney({
  actor,
  accountNames,
  onDistribute,
  onMove,
}: {
  actor: Actor;
  accountNames: Map<string, string>;
  onDistribute: () => void;
  onMove: () => void;
}) {
  const accounts = useAccounts();
  const retiredAccounts = useRetiredAccounts();
  const accountMoney = useAccountMoney();
  const [expanded, setExpanded] = useState(false);
  if (!accounts || !retiredAccounts || !accountMoney) return null;

  const inUse = accounts.filter((account) => !isCreditCard(account));
  const retiredHoldingMoney = retiredAccounts.filter((account) => {
    const envelopes = accountMoney.get(account.id)?.envelopes;
    return (
      envelopes &&
      (envelopes.unassigned !== 0 ||
        [...envelopes.cardPayments.values()].some((cents) => cents !== 0))
    );
  });
  const listed = [...inUse, ...retiredHoldingMoney];
  const unassigned = sumCents(
    listed.map((account) => accountMoney.get(account.id)?.envelopes?.unassigned ?? ZERO_CENTS)
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <HeroFigure
          label="Unassigned"
          value={<Money kind="balance" cents={unassigned} />}
          caption="Money in your accounts not yet in a category"
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={onMove} disabled={inUse.length === 0}>
            Move money
          </Button>
          <Button onClick={onDistribute} disabled={inUse.length === 0}>
            Distribute
          </Button>
        </div>
      </div>
      {listed.length === 0 ? (
        <EmptyState className="py-0">
          Add a bank, cash or e-wallet account on Accounts first.
        </EmptyState>
      ) : (
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            By account
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "transition-transform motion-reduce:transition-none",
                expanded && "rotate-180"
              )}
            />
          </Button>
          {expanded && (
            <UnassignedByAccount
              actor={actor}
              accounts={accounts}
              listed={listed}
              accountMoney={accountMoney}
              accountNames={accountNames}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** A card in use is paid from its Card Payment line in its Paying Account. */
function UnassignedByAccount({
  actor,
  accounts,
  listed,
  accountMoney,
  accountNames,
}: {
  actor: Actor;
  accounts: AccountRow[];
  listed: AccountRow[];
  accountMoney: Map<string, AccountMoney>;
  accountNames: Map<string, string>;
}) {
  const [payingCardId, setPayingCardId] = useState<string | null>(null);
  const payingCard = accounts.find((account) => account.id === payingCardId);
  useCloseWhenGone(payingCardId, payingCard ?? null, () => setPayingCardId(null));
  const payableFrom = (cardId: string, accountId: string) =>
    accounts.some((card) => card.id === cardId && card.payingAccountId === accountId);

  return (
    <>
      <ul aria-label="Unassigned by account" className="divide-y border-y">
        {listed.map((account) => {
          const envelopes = accountMoney.get(account.id)?.envelopes;
          const unassigned = envelopes?.unassigned ?? ZERO_CENTS;
          return (
            <li key={account.id} className="space-y-1 px-4 py-2">
              <div className="flex items-center justify-between gap-3">
                <p className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{account.name}</span>
                  {account.retired && <StatusBadge tone="outline">Retired</StatusBadge>}
                </p>
                <Money kind="balance" cents={unassigned} />
              </div>
              <NegativeNote cents={unassigned} label={OVERDRAWN_UNASSIGNED} />
              {namedAmounts(envelopes?.cardPayments, accountNames).map(({ id, cents, name }) => (
                <div
                  key={id}
                  className="flex items-center justify-between gap-3 text-body text-muted-foreground"
                >
                  <span className="min-w-0 truncate">Card Payment · {name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Money kind="balance" cents={cents} />
                    {payableFrom(id, account.id) && (
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Pay ${name}`}
                        onClick={() => setPayingCardId(id)}
                      >
                        Pay
                      </Button>
                    )}
                  </span>
                </div>
              ))}
            </li>
          );
        })}
      </ul>
      {payingCard && (
        <PayCardDialog actor={actor} card={payingCard} onClose={() => setPayingCardId(null)} />
      )}
    </>
  );
}
