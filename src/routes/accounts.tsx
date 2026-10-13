import { createFileRoute } from "@tanstack/react-router";
import { AccountsCard } from "@/components/accounts/AccountsCard";
import { PageShell } from "@/components/layout/PageShell";
import { useAccounts } from "@/hooks/useAccounts";
import { useHousehold } from "@/hooks/useHousehold";
import { useScrollToHash } from "@/hooks/useScrollToHash";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/accounts")({
  staticData: { title: "Accounts" },
  component: AccountsPage,
});

function AccountsPage() {
  const { household } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);
  // Home's Balances link to one account by hash; its row exists only once accounts load.
  useScrollToHash(useAccounts() !== undefined);

  return (
    <PageShell variant="centered">
      <PageShell.Main>
        {household && userId && <AccountsCard actor={{ householdId: household.id, userId }} />}
      </PageShell.Main>
    </PageShell>
  );
}
