# Instructions: Account Balances

Follow these steps in order. Estimated time: 60 minutes.

---

## Step 1: Create Account Balance Query Hook (15 min)

Add to `src/lib/supabaseQueries.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";

export interface AccountBalance {
  accountId: string;
  accountName: string;
  initialBalance: number;
  currentBalance: number;
  clearedBalance: number;
  pendingBalance: number;
  transactionCount: number;
  clearedCount: number;
  pendingCount: number;
}

export function useAccountBalance(accountId: string) {
  return useQuery({
    queryKey: ["account-balance", accountId],
    queryFn: async (): Promise<AccountBalance> => {
      // Fetch account info
      const { data: account, error: accountError } = await supabase
        .from("accounts")
        .select("id, name, initial_balance_cents")
        .eq("id", accountId)
        .single();

      if (accountError) throw accountError;

      // Fetch transactions for this account
      // IMPORTANT: Include transfers (they affect account balances)
      const { data: transactions, error: transactionsError } = await supabase
        .from("transactions")
        .select("amount_cents, type, status")
        .eq("account_id", accountId);

      if (transactionsError) throw transactionsError;

      // Calculate balances
      let currentBalance = account.initial_balance_cents;
      let clearedBalance = account.initial_balance_cents;
      let pendingBalance = 0;
      let clearedCount = 0;
      let pendingCount = 0;

      transactions.forEach((t) => {
        const amount = t.type === "income" ? t.amount_cents : -t.amount_cents;

        // Current balance includes all
        currentBalance += amount;

        // Split by status
        if (t.status === "cleared") {
          clearedBalance += amount;
          clearedCount++;
        } else {
          pendingBalance += amount;
          pendingCount++;
        }
      });

      return {
        accountId: account.id,
        accountName: account.name,
        initialBalance: account.initial_balance_cents,
        currentBalance,
        clearedBalance,
        pendingBalance,
        transactionCount: transactions.length,
        clearedCount,
        pendingCount,
      };
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

// Get balances for all accounts
export function useAccountBalances() {
  return useQuery({
    queryKey: ["account-balances"],
    queryFn: async (): Promise<AccountBalance[]> => {
      const { data: accounts, error: accountsError } = await supabase
        .from("accounts")
        .select("id, name, initial_balance_cents")
        .eq("is_active", true)
        .order("name");

      if (accountsError) throw accountsError;

      // Fetch all transactions grouped by account
      const { data: transactions, error: transactionsError } = await supabase
        .from("transactions")
        .select("account_id, amount_cents, type, status");

      if (transactionsError) throw transactionsError;

      // Calculate balances for each account
      return accounts.map((account) => {
        const accountTransactions = transactions.filter((t) => t.account_id === account.id);

        let currentBalance = account.initial_balance_cents;
        let clearedBalance = account.initial_balance_cents;
        let pendingBalance = 0;
        let clearedCount = 0;
        let pendingCount = 0;

        accountTransactions.forEach((t) => {
          const amount = t.type === "income" ? t.amount_cents : -t.amount_cents;

          currentBalance += amount;

          if (t.status === "cleared") {
            clearedBalance += amount;
            clearedCount++;
          } else {
            pendingBalance += amount;
            pendingCount++;
          }
        });

        return {
          accountId: account.id,
          accountName: account.name,
          initialBalance: account.initial_balance_cents,
          currentBalance,
          clearedBalance,
          pendingBalance,
          transactionCount: accountTransactions.length,
          clearedCount,
          pendingCount,
        };
      });
    },
    staleTime: 30 * 1000,
  });
}
```

---

## Step 2: Create Balance Display Component (10 min)

Create `src/components/AccountBalance.tsx`:

```typescript
import { formatPHP } from "@/lib/currency";
import { TrendingUp, TrendingDown, CheckCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  currentBalance: number;
  clearedBalance: number;
  pendingBalance: number;
  size?: "small" | "large";
  showSplit?: boolean;
}

export function AccountBalance({
  currentBalance,
  clearedBalance,
  pendingBalance,
  size = "large",
  showSplit = true,
}: Props) {
  const isPositive = currentBalance >= 0;

  return (
    <div className="space-y-2">
      {/* Current Balance */}
      <div className={cn("font-mono", size === "large" ? "text-3xl" : "text-xl")}>
        <div
          className={cn(
            "font-bold",
            isPositive
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          )}
        >
          {formatPHP(currentBalance)}
        </div>
        <div className="text-xs text-muted-foreground">Current Balance</div>
      </div>

      {/* Split Display */}
      {showSplit && (
        <div className="flex gap-4 text-sm">
          {/* Cleared Balance */}
          <div className="flex items-center gap-1">
            <CheckCircle className="h-3 w-3 text-green-600" />
            <span className="text-muted-foreground">Cleared:</span>
            <span className="font-mono font-medium">
              {formatPHP(clearedBalance)}
            </span>
          </div>

          {/* Pending Balance */}
          {pendingBalance !== 0 && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-yellow-600" />
              <span className="text-muted-foreground">Pending:</span>
              <span className="font-mono font-medium">
                {formatPHP(pendingBalance)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## Step 3: Create Account Balance Card (10 min)

Create `src/components/AccountBalanceCard.tsx`:

```typescript
import { Link } from "@tanstack/react-router";
import { Building2, CreditCard, Wallet, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AccountBalance } from "@/components/AccountBalance";
import { cn } from "@/lib/utils";

interface Props {
  account: {
    id: string;
    name: string;
    type: string;
    color?: string;
    icon?: string;
  };
  balance: {
    currentBalance: number;
    clearedBalance: number;
    pendingBalance: number;
  };
}

const accountIcons = {
  bank: Building2,
  credit_card: CreditCard,
  cash: Wallet,
  investment: TrendingUp,
};

export function AccountBalanceCard({ account, balance }: Props) {
  const Icon = accountIcons[account.type as keyof typeof accountIcons] || Building2;

  return (
    <Link
      to="/accounts/$accountId"
      params={{ accountId: account.id }}
      className="block"
    >
      <Card className="p-4 hover:bg-accent transition-colors cursor-pointer">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="rounded-lg p-2"
              style={{ backgroundColor: account.color || "#3B82F6" + "20" }}
            >
              <Icon
                className="h-5 w-5"
                style={{ color: account.color || "#3B82F6" }}
              />
            </div>
            <div>
              <h3 className="font-semibold">{account.name}</h3>
              <p className="text-xs text-muted-foreground capitalize">
                {account.type.replace("_", " ")}
              </p>
            </div>
          </div>

          <AccountBalance
            currentBalance={balance.currentBalance}
            clearedBalance={balance.clearedBalance}
            pendingBalance={balance.pendingBalance}
            size="small"
            showSplit={false}
          />
        </div>
      </Card>
    </Link>
  );
}
```

---

## Step 4: Update Accounts List Page (10 min)

Update `src/routes/accounts.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccountBalanceCard } from "@/components/AccountBalanceCard";
import { useAccounts, useAccountBalances } from "@/lib/supabaseQueries";

export const Route = createFileRoute("/accounts")({
  component: AccountsPage,
});

function AccountsPage() {
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: balances, isLoading: balancesLoading } = useAccountBalances();

  const isLoading = accountsLoading || balancesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold">Accounts</h1>
            <p className="text-sm text-muted-foreground">
              Manage your financial accounts
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Account
          </Button>
        </div>
      </header>

      {/* Account Cards */}
      <main className="container mx-auto px-4 py-8">
        {!accounts || accounts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No accounts yet</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {accounts.map((account) => {
              const balance = balances?.find(
                (b) => b.accountId === account.id
              ) || {
                currentBalance: account.initial_balance_cents || 0,
                clearedBalance: account.initial_balance_cents || 0,
                pendingBalance: 0,
              };

              return (
                <AccountBalanceCard
                  key={account.id}
                  account={account}
                  balance={balance}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
```

---

## Step 5: Create Account Detail Page (15 min)

Create `src/routes/accounts/$accountId.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AccountBalance } from "@/components/AccountBalance";
import { TransactionList } from "@/components/TransactionList";
import { useAccountBalance } from "@/lib/supabaseQueries";

export const Route = createFileRoute("/accounts/$accountId")({
  component: AccountDetailPage,
});

function AccountDetailPage() {
  const { accountId } = Route.useParams();
  const { data: balance, isLoading } = useAccountBalance(accountId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!balance) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Account not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4 mb-4">
            <Link to="/accounts">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold">{balance.accountName}</h1>
              <p className="text-sm text-muted-foreground">
                {balance.transactionCount} transactions
              </p>
            </div>
          </div>

          {/* Balance Display */}
          <div className="bg-card rounded-lg border p-6">
            <AccountBalance
              currentBalance={balance.currentBalance}
              clearedBalance={balance.clearedBalance}
              pendingBalance={balance.pendingBalance}
              size="large"
              showSplit={true}
            />

            <div className="mt-4 pt-4 border-t text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>Initial Balance:</span>
                <span className="font-mono">
                  {formatPHP(balance.initialBalance)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Cleared Transactions:</span>
                <span>{balance.clearedCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Pending Transactions:</span>
                <span>{balance.pendingCount}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Transactions */}
      <main className="container mx-auto px-4 py-8">
        <h2 className="text-lg font-semibold mb-4">Transactions</h2>
        <TransactionList
          filters={{ accountId }}
          onEdit={(id) => console.log("Edit", id)}
        />
      </main>
    </div>
  );
}
```

---

## Done!

When account balances display correctly with cleared/pending split, you're ready for the checkpoint.

**Next**: Run through `CHECKPOINT.md` to verify everything works.

---

## Notes

**CRITICAL**: Unlike analytics queries, balance calculations MUST include transfer transactions. Transfers affect account balances (money moving between accounts).

**Performance**: With the `idx_transactions_account_date` index, balance queries should complete in <30ms even with 1000+ transactions per account.
