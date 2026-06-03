import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPHP } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface AccountSummary {
  id: string;
  name: string;
  type: string;
}

interface AccountBalanceSummary {
  accountId: string;
  currentBalance: number;
  clearedBalance: number;
  pendingBalance: number;
}

interface AccountDetailPaneProps {
  accountId: string | null;
  accounts: AccountSummary[];
  balances: AccountBalanceSummary[];
  onAddAccount: () => void;
}

export function AccountDetailPane({
  accountId,
  accounts,
  balances,
  onAddAccount,
}: AccountDetailPaneProps) {
  if (!accountId) {
    const total = balances.reduce((sum, b) => sum + b.currentBalance, 0);
    return (
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-sm text-muted-foreground">Total across all accounts</div>
            <div className="text-2xl font-mono tabular-nums">{formatPHP(total)}</div>
          </div>
          <Button onClick={onAddAccount} variant="outline" className="w-full">
            <Plus className="mr-2 h-4 w-4" />
            Add Account
          </Button>
        </CardContent>
      </Card>
    );
  }

  const account = accounts.find((a) => a.id === accountId);
  const balance = balances.find((b) => b.accountId === accountId);
  if (!account || !balance) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{account.name}</CardTitle>
        <p className="text-sm text-muted-foreground capitalize">{account.type}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-sm text-muted-foreground">Current balance</div>
          <div className="text-3xl font-mono tabular-nums">{formatPHP(balance.currentBalance)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Cleared {formatPHP(balance.clearedBalance)} · Pending{" "}
            {formatPHP(balance.pendingBalance)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
