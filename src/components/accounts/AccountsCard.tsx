import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SubmitButton } from "@/components/ui/submit-button";
import { useAccounts, useRetiredAccounts } from "@/hooks/useAccounts";
import type { AccountRow } from "@/lib/accounts/projection";
import { createAccount, unretireAccount, type Actor } from "@/lib/commands/accounts";
import { formatPHP } from "@/lib/currency";
import type { Visibility } from "@/lib/events/log";
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

function AccountItem({ account, children }: { account: AccountRow; children: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <p className="flex items-center gap-2">
          <span className="truncate font-medium">{account.name}</span>
          {account.visibility === "personal" && <Badge variant="secondary">Personal</Badge>}
        </p>
        <p className="text-sm text-muted-foreground">{ACCOUNT_TYPE_LABELS[account.type]}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="tabular-nums">{formatPHP(account.startingBalanceCents)}</span>
        {children}
      </div>
    </li>
  );
}

function RetiredAccounts({ actor }: { actor: Actor }) {
  const retired = useRetiredAccounts();
  const [shown, setShown] = useState(false);
  const [unretiring, startUnretiring] = useTransition();

  if (!retired || retired.length === 0) return null;

  const unretire = (account: AccountRow) =>
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
      <AccountDetailsFields idPrefix="account" />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Who sees it</legend>
        {/* Keyed so each new account starts as Household again; Personal is a deliberate choice. */}
        <RadioGroup key={state.added} name="visibility" defaultValue="household">
          <VisibilityOption value="household" label="Household">
            Every member sees it.
          </VisibilityOption>
          <VisibilityOption value="personal" label="Personal">
            Only you see it, and it stays yours if you leave the household.
          </VisibilityOption>
        </RadioGroup>
        <p className="text-sm text-muted-foreground">Visibility can&apos;t be changed later.</p>
      </fieldset>

      <FormError>{state.error}</FormError>

      <SubmitButton pendingText="Adding...">Add account</SubmitButton>
    </form>
  );
}

function VisibilityOption({
  value,
  label,
  children,
}: {
  value: Visibility;
  label: string;
  children: string;
}) {
  const id = `account-visibility-${value}`;
  return (
    <div className="flex items-start gap-3">
      <RadioGroupItem id={id} value={value} aria-describedby={`${id}-hint`} className="mt-0.5" />
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {children}
        </p>
      </div>
    </div>
  );
}
