import { createFileRoute } from "@tanstack/react-router";
import { AccountsView } from "@/components/accounts/AccountsView";
import { readOpenItem } from "@/components/layout/DetailPane";
import { PageShell } from "@/components/layout/PageShell";
import { useAccounts } from "@/hooks/useAccounts";
import { useHousehold } from "@/hooks/useHousehold";
import { useScrollToHash } from "@/hooks/useScrollToHash";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/accounts")({
  staticData: { title: "Accounts" },
  validateSearch: readOpenItem,
  component: AccountsPage,
});

function AccountsPage() {
  const { household } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);
  // The opening checklist links to the add form by hash; it renders once accounts load.
  useScrollToHash(useAccounts() !== undefined);

  return (
    <PageShell variant="list-detail">
      {household && userId && <AccountsView actor={{ householdId: household.id, userId }} />}
    </PageShell>
  );
}
