import { useActionState, useState, useTransition } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ActionForm } from "@/components/app/ActionForm";
import { Button } from "@/components/app/Button";
import { EmptyState } from "@/components/app/EmptyState";
import { FormError } from "@/components/app/FormError";
import { advanceOnEnter } from "@/components/app/FormSheet";
import { ListRow } from "@/components/app/ListRow";
import { Money } from "@/components/app/Money";
import { SectionHeader } from "@/components/app/SectionHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { SubmitButton } from "@/components/app/SubmitButton";
import { VisibilityField } from "@/components/app/VisibilityField";
import { namedAmounts } from "@/components/allocations/envelopes";
import { CorrectBalanceDialog } from "@/components/corrections/CorrectBalanceDialog";
import { DetailPane, resolveOpenItem, useOpenItem } from "@/components/layout/DetailPane";
import { PageShell } from "@/components/layout/PageShell";
import { useAccountNames, useAccounts, useRetiredAccounts } from "@/hooks/useAccounts";
import { useAccountMoney } from "@/hooks/useTransactions";
import { ACCOUNT_TYPES, isCreditCard, type AccountType } from "@/lib/accounts/events";
import type { AccountListItem } from "@/lib/accounts/projection";
import { createAccount, unretireAccount, type Actor } from "@/lib/commands/accounts";
import { sumCents } from "@/lib/currency";
import { VISIBILITY_LABELS, type Visibility } from "@/lib/events/ownership";
import type { AccountMoney } from "@/lib/transactions/money";
import { errorMessage } from "@/lib/utils";
import {
  ACCOUNT_TYPE_LABELS,
  AccountDetailsFields,
  readAccountDetails,
} from "./AccountDetailsFields";
import { EditAccountDialog } from "./EditAccountDialog";
import { PayCardDialog } from "./PayCardDialog";

const SECTION_TITLES: Record<AccountType, string> = {
  bank: "Bank accounts",
  cash: "Cash",
  e_wallet: "E-wallets",
  investment: "Investments",
  credit_card: "Credit cards",
};

type MoneyByAccount = Map<string, AccountMoney> | undefined;

/**
 * Accounts in sections by type, then the retired ones and the add form. An
 * account opens in the `DetailPane`, which holds its money and its actions.
 */
export function AccountsView({ actor }: { actor: Actor }) {
  const accounts = useAccounts();
  const retired = useRetiredAccounts();
  const money = useAccountMoney();
  const { openId, open } = useOpenItem();
  const openAccount = resolveOpenItem(
    openId,
    accounts &&
      retired &&
      ((id) => accounts.find((account) => account.id === id) ?? retired.find((a) => a.id === id))
  );

  return (
    <>
      {/* A few rows and a form read best at the single column's width, pane or not. */}
      <PageShell.List className="max-w-3xl space-y-8">
        {accounts?.length === 0 && (
          <EmptyState>No accounts yet. Add the first one below.</EmptyState>
        )}
        {accounts && accounts.length > 0 && (
          <AccountSections accounts={accounts} money={money} openId={openId} onOpen={open} />
        )}
        <RetiredAccounts retired={retired} money={money} openId={openId} onOpen={open} />
        <AddAccountForm actor={actor} />
      </PageShell.List>
      <DetailPane
        title={openAccount?.name ?? ""}
        description={openAccount && ACCOUNT_TYPE_LABELS[openAccount.type]}
        item={openAccount}
      >
        {(account) => (
          // Keyed, so an open dialog doesn't follow a newly picked account.
          <AccountDetail
            key={account.id}
            actor={actor}
            account={account}
            money={money?.get(account.id)}
          />
        )}
      </DetailPane>
    </>
  );
}

interface RowsProps {
  money: MoneyByAccount;
  openId: string | null;
  onOpen: (id: string) => void;
}

function AccountSections({ accounts, ...rows }: RowsProps & { accounts: AccountListItem[] }) {
  const sections = ACCOUNT_TYPES.map((type) => ({
    type,
    accounts: accounts.filter((account) => account.type === type),
  })).filter((section) => section.accounts.length > 0);

  return (
    <ul aria-label="Accounts" className="space-y-8">
      {sections.map((section) => {
        const title = SECTION_TITLES[section.type];
        const balances = section.accounts.map((account) => rows.money?.get(account.id)?.balance);
        const total = balances.every((balance) => balance !== undefined)
          ? sumCents(balances)
          : undefined;
        return (
          <li key={section.type}>
            <SectionHeader
              title={title}
              action={
                section.accounts.length > 1 &&
                total !== undefined && (
                  <Money
                    kind="balance"
                    owed={section.type === "credit_card"}
                    cents={total}
                    className="text-body text-muted-foreground"
                  />
                )
              }
            />
            {/* Unnamed: a name holding "accounts" would also match the outer list by name. */}
            <AccountRows accounts={section.accounts} {...rows} />
          </li>
        );
      })}
    </ul>
  );
}

function AccountRows({
  label,
  accounts,
  money,
  openId,
  onOpen,
}: RowsProps & { label?: string; accounts: AccountListItem[] }) {
  return (
    <ul aria-label={label} className="mt-2 divide-y border-y">
      {accounts.map((account) => {
        const accountMoney = money?.get(account.id);
        const card = isCreditCard(account);
        return (
          <li
            key={account.id}
            id={`account-${account.id}`}
            className="scroll-mt-[calc(var(--app-header)+1rem)]"
          >
            <ListRow
              onClick={() => onOpen(account.id)}
              open={account.id === openId}
              label={
                <>
                  {account.name}
                  {account.visibility === "personal" && (
                    <StatusBadge tone="neutral" className="ml-2">
                      Personal
                    </StatusBadge>
                  )}
                </>
              }
              amount={
                accountMoney && <Money kind="balance" owed={card} cents={accountMoney.balance} />
              }
              detail={<RowDetail account={account} money={accountMoney} />}
            />
          </li>
        );
      })}
    </ul>
  );
}

function payingAccountSummary({ payingAccount }: AccountListItem): string {
  if (!payingAccount) return "Paying account not on this device yet";
  return `Paid from ${payingAccount.name}${payingAccount.retired ? " (retired)" : ""}`;
}

/** A card's Paying Account; any other account's Unassigned, the money it can still give a job. */
function RowDetail({ account, money }: { account: AccountListItem; money?: AccountMoney }) {
  if (isCreditCard(account)) return payingAccountSummary(account);
  if (!money?.envelopes) return ACCOUNT_TYPE_LABELS[account.type];
  return (
    <>
      Unassigned <Money kind="balance" cents={money.envelopes.unassigned} />
    </>
  );
}

/** The open account: its money, who sees it, and what can be done with it. */
function AccountDetail({
  actor,
  account,
  money,
}: {
  actor: Actor;
  account: AccountListItem;
  money: AccountMoney | undefined;
}) {
  const { close } = useOpenItem();
  const [dialog, setDialog] = useState<"edit" | "pay" | "correct" | null>(null);
  const card = isCreditCard(account);
  const retired = account.retired;
  const closeDialog = () => setDialog(null);

  return (
    <div className="space-y-6">
      {money && (
        <div>
          <p className="text-caption text-muted-foreground">{card ? "Amount owed" : "Balance"}</p>
          <Money kind="balance" owed={card} cents={money.balance} className="block text-heading" />
        </div>
      )}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3 text-body">
        {card && (
          <Fact term="Paid from">{account.payingAccount?.name ?? "Not on this device yet"}</Fact>
        )}
        {money && (
          <>
            <Fact term="Cleared">
              <Money kind="balance" owed={card} cents={money.cleared} />
            </Fact>
            <Fact term="Pending">
              <Money kind="balance" owed={card} cents={money.pending} />
            </Fact>
          </>
        )}
        {money?.envelopes && <Envelopes envelopes={money.envelopes} />}
        <Fact term="Who sees it">{VISIBILITY_LABELS[account.visibility]}</Fact>
        {retired && <Fact term="Status">Retired</Fact>}
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        {retired ? (
          <UnretireButton actor={actor} account={account} />
        ) : (
          <>
            {card && <Button onClick={() => setDialog("pay")}>Pay {account.name}</Button>}
            <Button variant={card ? "outline" : "default"} onClick={() => setDialog("edit")}>
              Edit
            </Button>
            <Button variant="outline" onClick={() => setDialog("correct")}>
              Correct balance
            </Button>
          </>
        )}
        <Button asChild variant="ghost">
          <Link to="/transactions" search={{ account: account.id }}>
            View transactions
          </Link>
        </Button>
      </div>
      {dialog === "edit" && (
        <EditAccountDialog
          actor={actor}
          account={account}
          onCorrectBalance={() => setDialog("correct")}
          onRetired={close}
          onClose={closeDialog}
        />
      )}
      {dialog === "pay" && <PayCardDialog actor={actor} card={account} onClose={closeDialog} />}
      {dialog === "correct" && (
        <CorrectBalanceDialog actor={actor} account={account} onClose={closeDialog} />
      )}
    </div>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

/** The account's Unassigned and the Card Payment it holds for each card paid from it. */
function Envelopes({ envelopes }: { envelopes: NonNullable<AccountMoney["envelopes"]> }) {
  const names = useAccountNames();
  return (
    <>
      <Fact term="Unassigned">
        <Money kind="balance" cents={envelopes.unassigned} />
      </Fact>
      {names &&
        namedAmounts(envelopes.cardPayments, names).map(({ id, cents, name }) => (
          <Fact key={id} term={`Card Payment · ${name}`}>
            <Money kind="balance" cents={cents} />
          </Fact>
        ))}
    </>
  );
}

function UnretireButton({ actor, account }: { actor: Actor; account: AccountListItem }) {
  const [unretiring, startUnretiring] = useTransition();
  const unretire = () =>
    startUnretiring(async () => {
      try {
        await unretireAccount(actor, account.id);
        toast.success(`${account.name} is back in Accounts`);
      } catch (caught) {
        toast.error(errorMessage(caught, "Couldn't unretire the account."));
      }
    });
  return (
    <Button disabled={unretiring} onClick={unretire}>
      Unretire {account.name}
    </Button>
  );
}

function RetiredAccounts({
  retired,
  ...rows
}: RowsProps & { retired: AccountListItem[] | undefined }) {
  const [shown, setShown] = useState(false);
  if (!retired || retired.length === 0) return null;

  return (
    <section className="space-y-2">
      <Button variant="link" className="h-auto p-0" onClick={() => setShown(!shown)}>
        {shown ? "Hide retired accounts" : `Show retired accounts (${retired.length})`}
      </Button>
      {shown && <AccountRows label="Retired" accounts={retired} {...rows} />}
    </section>
  );
}

function AddAccountForm({ actor }: { actor: Actor }) {
  const [state, addAction] = useActionState(
    async (
      previous: { startingBalanceError?: string; error: string | null; added: number },
      formData: FormData
    ) => {
      const { input, startingBalanceError } = readAccountDetails(formData);
      if (startingBalanceError !== null) {
        return { startingBalanceError, error: null, added: previous.added };
      }
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
    <section className="space-y-4">
      <SectionHeader title="Add an account" />
      <ActionForm
        ref={advanceOnEnter}
        id="add-account"
        action={addAction}
        noValidate
        className="scroll-mt-[calc(var(--app-header)+1rem)] space-y-4"
        aria-label="Add an account"
      >
        {/* Keyed so each new account starts as a Household bank account again; Personal is a deliberate choice. */}
        <NewAccountFields
          key={state.added}
          userId={actor.userId}
          startingBalanceError={state.startingBalanceError}
        />

        <FormError>{state.error}</FormError>

        <SubmitButton pendingText="Adding…">Add account</SubmitButton>
      </ActionForm>
    </section>
  );
}

function NewAccountFields({
  userId,
  startingBalanceError,
}: {
  userId: string;
  startingBalanceError?: string;
}) {
  const [visibility, setVisibility] = useState<Visibility>("household");

  return (
    <>
      <AccountDetailsFields
        types={ACCOUNT_TYPES}
        ownership={{ visibility, ownerUserId: visibility === "personal" ? userId : null }}
        startingBalanceError={startingBalanceError}
      />

      <VisibilityField idPrefix="account" value={visibility} onChange={setVisibility} />
    </>
  );
}
