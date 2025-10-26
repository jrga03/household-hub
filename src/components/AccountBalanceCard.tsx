import { Link } from "@tanstack/react-router";
import { Building2, CreditCard, Wallet, TrendingUp, Smartphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AccountBalance } from "@/components/AccountBalance";

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

/**
 * Icon mapping for account types
 * Maps account type to appropriate Lucide icon component
 */
const accountIcons = {
  bank: Building2,
  credit_card: CreditCard,
  cash: Wallet,
  investment: TrendingUp,
  "e-wallet": Smartphone,
} as const;

/**
 * AccountBalanceCard Component
 *
 * Clickable card displaying account information with balance.
 * Used in the accounts list page to show all accounts at a glance.
 * Links to the account detail page on click.
 *
 * Features:
 * - Account icon based on type (bank, credit card, etc.)
 * - Custom color styling from account settings
 * - Current balance display (compact, no split)
 * - Hover state for interactivity
 * - Type label (formatted from snake_case)
 *
 * @param account - Account basic info (id, name, type, color, icon)
 * @param balance - Balance breakdown (current, cleared, pending)
 *
 * @example
 * <AccountBalanceCard
 *   account={{
 *     id: "acc-123",
 *     name: "Chase Checking",
 *     type: "bank",
 *     color: "#3B82F6"
 *   }}
 *   balance={{
 *     currentBalance: 1200000,
 *     clearedBalance: 1300000,
 *     pendingBalance: -100000
 *   }}
 * />
 */
export function AccountBalanceCard({ account, balance }: Props) {
  const Icon = accountIcons[account.type as keyof typeof accountIcons] || Building2;

  return (
    <Link to="/accounts/$accountId" params={{ accountId: account.id }} className="block">
      <Card className="p-4 hover:bg-accent transition-colors cursor-pointer">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="rounded-lg p-2"
              style={{ backgroundColor: account.color || "#3B82F6" + "20" }}
            >
              <Icon className="h-5 w-5" style={{ color: account.color || "#3B82F6" }} />
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
