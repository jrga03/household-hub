import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { EditAccountDialog } from "./EditAccountDialog";
import { FormError } from "@/components/ui/form-error";
import { errorMessage } from "@/lib/utils";

export function AccountsCard({ actor }: { actor: Actor }) {
  const accounts = useAccounts();
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = accounts?.find((account) => account.id === editingId);
  // Another device retired it mid-edit: drop it, so unretiring later doesn't reopen the dialog.
  if (editingId && accounts && !editing) setEditingId(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accounts</CardTitle>
        <CardDescription>
          Household accounts every member sees, and Personal accounts only you see.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {accounts?.length === 0 && (
          <p className="text-sm text-muted-foreground">No accounts yet. Add the first one below.</p>
        )}
        {accounts && accounts.length > 0 && (
          <ul aria-label="Accounts" className="divide-y rounded-md border">
            {accounts.map((account) => (
              <AccountItem key={account.id} account={account}>
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
          <EditAccountDialog actor={actor} account={editing} onClose={() => setEditingId(null)} />
        )}
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
    <li className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <p className="flex items-center gap-2">
          <span className="truncate font-medium">{account.name}</span>
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

const negativeClass = (cents: Cents) => (cents < 0 ? "text-destructive" : undefined);

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
    <form action={addAction} className="space-y-4" aria-label="Add an account">
      {/* Keyed so each new account starts as a Household bank account again; Personal is a deliberate choice. */}
      <NewAccountFields key={state.added} userId={actor.userId} />

      <FormError>{state.error}</FormError>

      <SubmitButton pendingText="Adding...">Add account</SubmitButton>
    </form>
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
