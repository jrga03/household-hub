import { useActionState, useState, useTransition } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { useAccountNames, useAccounts, useRetiredAccounts } from "@/hooks/useAccounts";
import { useAccountMoney } from "@/hooks/useTransactions";
import { ACCOUNT_TYPES, isCreditCard } from "@/lib/accounts/events";
import type { AccountListItem } from "@/lib/accounts/projection";
import { createAccount, unretireAccount, type Actor } from "@/lib/commands/accounts";
import { formatPHP, type Cents } from "@/lib/currency";
import type { AccountMoney } from "@/lib/transactions/money";
import type { Visibility } from "@/lib/events/log";
import { VisibilityField } from "@/components/VisibilityField";
import {
  ACCOUNT_TYPE_LABELS,
  AccountDetailsFields,
  readAccountDetails,
} from "./AccountDetailsFields";
import { advanceOnEnter } from "@/components/FormSheet";
import { EditAccountDialog } from "./EditAccountDialog";
import { PayCardDialog } from "./PayCardDialog";
import { CorrectBalanceDialog } from "@/components/corrections/CorrectBalanceDialog";
import { FormError } from "@/components/ui/form-error";
import { errorMessage } from "@/lib/utils";
import { useCloseWhenGone } from "@/hooks/useCloseWhenGone";

export function AccountsCard({ actor }: { actor: Actor }) {
  const accounts = useAccounts();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const editing = accounts?.find((account) => account.id === editingId);
  const paying = accounts?.find((account) => account.id === payingId);
  // Only accounts in use are listed here, so a retired one can't be corrected.
  const correcting = accounts?.find((account) => account.id === correctingId);
  useCloseWhenGone(editingId, accounts && (editing ?? null), () => setEditingId(null));
  useCloseWhenGone(payingId, accounts && (paying ?? null), () => setPayingId(null));
  useCloseWhenGone(correctingId, accounts && (correcting ?? null), () => setCorrectingId(null));

  return (
    <Card>
      <CardContent className="space-y-6">
        {accounts?.length === 0 && (
          <p className="text-sm text-muted-foreground">No accounts yet. Add the first one below.</p>
        )}
        {accounts && accounts.length > 0 && (
          <ul aria-label="Accounts" className="divide-y rounded-md border">
            {accounts.map((account) => (
              <AccountItem key={account.id} account={account}>
                {isCreditCard(account) && (
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Pay ${account.name}`}
                    onClick={() => setPayingId(account.id)}
                  >
                    Pay
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Correct ${account.name}`}
                  onClick={() => setCorrectingId(account.id)}
                >
                  Correct
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${account.name}`}
                  onClick={() => setEditingId(account.id)}
                >
                  Edit
                </Button>
              </AccountItem>
            ))}
          </ul>
        )}
        {editing && (
          <EditAccountDialog
            actor={actor}
            account={editing}
            onCorrectBalance={() => {
              setEditingId(null);
              setCorrectingId(editing.id);
            }}
            onClose={() => setEditingId(null)}
          />
        )}
        {correcting && (
          <CorrectBalanceDialog
            actor={actor}
            account={correcting}
            onClose={() => setCorrectingId(null)}
          />
        )}
        {paying && <PayCardDialog actor={actor} card={paying} onClose={() => setPayingId(null)} />}
        <RetiredAccounts actor={actor} />
        <AddAccountForm actor={actor} />
      </CardContent>
    </Card>
  );
}

function payingAccountSummary({ payingAccount }: AccountListItem): string {
  if (!payingAccount) return "Paying account not on this device yet";
  return `Paid from ${payingAccount.name}${payingAccount.retired ? " (retired)" : ""}`;
}

function AccountItem({
  account,
  children,
}: {
  account: AccountListItem;
  children: React.ReactNode;
}) {
  const money = useAccountMoney()?.get(account.id);
  return (
    <li
      id={`account-${account.id}`}
      className="flex scroll-mt-4 items-center justify-between gap-3 px-3 py-2"
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2">
          <Link
            to="/transactions"
            search={{ account: account.id }}
            className="truncate font-medium hover:underline"
          >
            {account.name}
          </Link>
          {account.visibility === "personal" && <Badge variant="secondary">Personal</Badge>}
        </p>
        <p className="text-sm text-muted-foreground">
          {ACCOUNT_TYPE_LABELS[account.type]}
          {isCreditCard(account) && ` · ${payingAccountSummary(account)}`}
        </p>
        {money && <MoneySummary money={money} />}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {money && (
          <span
            className="tabular-nums"
            aria-label={isCreditCard(account) ? "Amount owed" : "Balance"}
          >
            {formatPHP(money.balance)}
          </span>
        )}
        {children}
      </div>
    </li>
  );
}

const negativeClass = (cents: Cents) => (cents < 0 ? "text-shortfall" : undefined);

/**
 * "Cleared ₱X · Pending ₱Y", the account's Unassigned, and the Card Payment of
 * each card paid from it (red when negative).
 */
function MoneySummary({ money }: { money: AccountMoney }) {
  return (
    <>
      <p className="text-sm text-muted-foreground tabular-nums">
        Cleared {formatPHP(money.cleared)} · Pending {formatPHP(money.pending)}
        {money.envelopes && (
          <>
            {" · "}
            <span className={negativeClass(money.envelopes.unassigned)}>
              Unassigned {formatPHP(money.envelopes.unassigned)}
            </span>
          </>
        )}
      </p>
      {money.envelopes && <CardPayments cardPayments={money.envelopes.cardPayments} />}
    </>
  );
}

function CardPayments({ cardPayments }: { cardPayments: Map<string, Cents> }) {
  const names = useAccountNames();
  if (!names) return null;
  const reserved = [...cardPayments]
    .filter(([, cents]) => cents !== 0)
    .map(([cardId, cents]) => ({ cardId, cents, name: names.get(cardId) ?? "A card" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return reserved.map(({ cardId, cents, name }) => (
    <p key={cardId} className="text-sm text-muted-foreground tabular-nums">
      <span className={negativeClass(cents)}>
        Card Payment · {name} {formatPHP(cents)}
      </span>
    </p>
  ));
}

function RetiredAccounts({ actor }: { actor: Actor }) {
  const retired = useRetiredAccounts();
  const [shown, setShown] = useState(false);
  const [unretiring, startUnretiring] = useTransition();

  if (!retired || retired.length === 0) return null;

  const unretire = (account: AccountListItem) =>
    startUnretiring(async () => {
      try {
        await unretireAccount(actor, account.id);
        toast.success(`${account.name} is back in Accounts`);
      } catch (caught) {
        toast.error(errorMessage(caught, "Couldn't unretire the account."));
      }
    });

  return (
    <div className="space-y-3">
      <Button variant="link" className="h-auto p-0" onClick={() => setShown(!shown)}>
        {shown ? "Hide retired accounts" : `Show retired accounts (${retired.length})`}
      </Button>
      {shown && (
        <ul aria-label="Retired accounts" className="divide-y rounded-md border">
          {retired.map((account) => (
            <AccountItem key={account.id} account={account}>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Unretire ${account.name}`}
                disabled={unretiring}
                onClick={() => unretire(account)}
              >
                Unretire
              </Button>
            </AccountItem>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddAccountForm({ actor }: { actor: Actor }) {
  const [state, addAction] = useActionState(
    async (previous: { error: string | null; added: number }, formData: FormData) => {
      const { input, error } = readAccountDetails(formData);
      if (error !== null) return { error, added: previous.added };
      try {
        await createAccount(actor, {
          ...input,
          visibility: String(formData.get("visibility") ?? ""),
        });
        toast.success("Account added");
        return { error: null, added: previous.added + 1 };
      } catch (caught) {
        return {
          error: errorMessage(caught, "Couldn't add the account."),
          added: previous.added,
        };
      }
    },
    { error: null, added: 0 }
  );

  return (
    <ActionForm
      ref={advanceOnEnter}
      id="add-account"
      action={addAction}
      className="scroll-mt-4 space-y-4"
      aria-label="Add an account"
    >
      {/* Keyed so each new account starts as a Household bank account again; Personal is a deliberate choice. */}
      <NewAccountFields key={state.added} userId={actor.userId} />

      <FormError>{state.error}</FormError>

      <SubmitButton pendingText="Adding...">Add account</SubmitButton>
    </ActionForm>
  );
}

function NewAccountFields({ userId }: { userId: string }) {
  const [visibility, setVisibility] = useState<Visibility>("household");

  return (
    <>
      <AccountDetailsFields
        idPrefix="account"
        types={ACCOUNT_TYPES}
        ownership={{ visibility, ownerUserId: visibility === "personal" ? userId : null }}
      />

      <VisibilityField idPrefix="account" value={visibility} onChange={setVisibility} />
    </>
  );
}
